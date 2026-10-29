-- Avisar los vencimientos: de v_vencimientos a notificaciones (2026-10-29).
-- Escrita y aplicada por el orquestador. Idempotente. Va después de la 119.
--
-- ------------------------------------------------------------------ el candado que había que abrir
-- `fn_notificar` y `fn_notif_con_permiso` (migración 76) exigen `pg_trigger_depth() > 0`: solo
-- trabajan dentro de un trigger. El candado está bien puesto — impide que alguien fabrique
-- notificaciones a mano desde la app.
--
-- Pero el motor de vencimientos NO es un trigger: no hay una fila que se inserte cuando un
-- certificado se vence; lo único que pasa es que el tiempo avanza. Corre por pg_cron, una vez al
-- día. Con el candado como estaba, `fn_notificar` habría respondido "las notificaciones las genera
-- la base; no se crean a mano" y `fn_notif_con_permiso` habría devuelto cero destinatarios: el
-- aviso no habría salido NUNCA, y sin un solo error en los registros. Un silencio, que es la peor
-- forma de fallar.
--
-- Se abre lo mínimo: además del trigger, se admite que llame el proceso de la base
-- (postgres / supabase_admin). Un usuario conectado a la app sigue sin poder.
--
-- ------------------------------------------------------------------ a quién se le avisa
--   sgsst         → vencimiento_sst,   a todos los que tengan SG-SST (incluye "consultar")
--   rrhh          → vencimiento_rrhh,  solo a quien TRABAJA en RRHH (un fin de contrato con su
--                                      salario al lado no es para cualquiera que mire)
--   el resto      → vencimiento_admin, a quien trabaja en ese módulo
-- Y siempre al responsable del ítem, si lo tiene.
--
-- ------------------------------------------------------------------ cada cuánto se repite
-- Una vez cada 7 días por cosa y por persona. Un certificado que se vence en 60 días no puede
-- mandar el mismo aviso 60 mañanas seguidas: eso enseña a ignorar los avisos, y el día que llegue
-- uno importante nadie lo va a abrir.
--
-- Verificación: supabase/verificaciones/20261130000120_verificar.sql

-- ============================================================ 1) abrir el candado, lo mínimo
create or replace function public.fn_notif_con_permiso(p_modulo text, p_nivel nivel_permiso)
returns setof uuid language sql stable security definer set search_path = public as $$
  select p.id from perfiles p join permisos_rol pr on pr.rol_id = p.rol_id and pr.modulo_id = p_modulo
  where (pg_trigger_depth() > 0 or current_user in ('postgres', 'supabase_admin'))
    and case p_nivel when 'consultar' then true
                     when 'trabajar' then pr.nivel in ('trabajar', 'responsable')
                     else pr.nivel = 'responsable' end;
$$;

create or replace function public.fn_notificar(
  p_destinatario uuid, p_tipo text, p_titulo text, p_cuerpo text, p_ruta text,
  p_origen_tabla text, p_origen_id uuid, p_urgente boolean default false)
returns void language plpgsql security definer set search_path = public as $$
begin
  if pg_trigger_depth() = 0 and current_user not in ('postgres', 'supabase_admin') then
    raise exception 'Las notificaciones las genera la base; no se crean a mano.';
  end if;
  if p_destinatario is null or p_destinatario = auth.uid() then
    return;
  end if;
  if not exists (select 1 from perfiles where id = p_destinatario) then
    return;
  end if;
  if not coalesce(
       (select activa from notificacion_preferencias where perfil_id = p_destinatario and tipo = p_tipo),
       (select por_defecto from notificacion_tipos where id = p_tipo), true) then
    return;
  end if;
  begin
    insert into notificaciones (destinatario_id, tipo, titulo, cuerpo, ruta, urgente, origen_tabla, origen_id)
    values (p_destinatario, p_tipo, coalesce(nullif(trim(p_titulo), ''), 'Aviso'), p_cuerpo, p_ruta,
            coalesce(p_urgente, false), p_origen_tabla, p_origen_id);
  exception when others then
    raise warning 'No se pudo crear la notificación % para %: %', p_tipo, p_destinatario, sqlerrm;
  end;
end;
$$;

-- ============================================================ 2) el que avisa
create or replace function public.fn_avisar_vencimientos(p_repetir_dias int default 7)
returns int language plpgsql security definer set search_path = public as $$
declare
  v record; d uuid; v_tipo text; v_nivel nivel_permiso; v_cuerpo text; v_n int := 0;
begin
  if current_user not in ('postgres', 'supabase_admin') then
    raise exception 'Esto lo corre la base, no un usuario.';
  end if;

  for v in select * from v_vencimientos where estado in ('por_vencer', 'hoy', 'vencido') loop
    if v.modulo = 'sgsst' then v_tipo := 'vencimiento_sst'; v_nivel := 'consultar';
    elsif v.modulo = 'rrhh' then v_tipo := 'vencimiento_rrhh'; v_nivel := 'trabajar';
    else v_tipo := 'vencimiento_admin'; v_nivel := 'trabajar';
    end if;

    v_cuerpo := v.categoria || ': ' ||
      case v.estado
        when 'vencido' then 'venció hace ' || abs(v.dias) || ' día(s), el ' || to_char(v.vence, 'DD/MM/YYYY')
        when 'hoy' then 'se vence HOY'
        else 'se vence en ' || v.dias || ' día(s), el ' || to_char(v.vence, 'DD/MM/YYYY')
      end
      || coalesce('. ' || v.detalle, '');

    for d in
      select fn_notif_con_permiso(v.modulo, v_nivel)
      union
      select v.responsable_id where v.responsable_id is not null
    loop
      -- No repetir lo mismo a la misma persona antes de tiempo.
      if not exists (
        select 1 from notificaciones n
        where n.destinatario_id = d and n.origen_tabla = v.origen_tabla and n.origen_id = v.origen_id
          and n.tipo = v_tipo
          and n.creada_en > now() - (p_repetir_dias || ' days')::interval
      ) then
        perform fn_notificar(d, v_tipo, v.titulo, v_cuerpo, v.ruta, v.origen_tabla, v.origen_id,
                             v.estado in ('hoy', 'vencido'));
        v_n := v_n + 1;
      end if;
    end loop;
  end loop;
  return v_n;
end;
$$;
revoke all on function public.fn_avisar_vencimientos(int) from public, anon, authenticated;

-- ============================================================ 3) una vez al día, 7:10 de Bogotá
select cron.schedule('avisar-vencimientos', '10 12 * * *', $job$ select public.fn_avisar_vencimientos(7); $job$);
