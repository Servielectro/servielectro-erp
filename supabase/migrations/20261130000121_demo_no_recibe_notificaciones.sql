-- El usuario de demostración no recibe notificaciones (2026-10-29).
-- Escrita y aplicada por el orquestador. Idempotente.
--
-- Salió probando el motor de vencimientos: la primera corrida le mandó el aviso de una tarea real
-- al usuario "Prueba". Un invitado no tiene por qué enterarse de lo que se le vence a la empresa,
-- y menos recibirlo en el celular cuando el push esté andando.
--
-- Va en fn_notificar, que es el embudo por donde pasan TODAS las notificaciones. Ponerlo aquí
-- significa que ningún tipo futuro se puede olvidar de excluirlo.
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
  -- Un usuario de demostración no recibe avisos de la operación real.
  if fn_es_demo(p_destinatario) then
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

delete from public.notificaciones n
 using public.perfiles p, public.roles r
 where n.destinatario_id = p.id and p.rol_id = r.id and r.nombre = 'Usuario Prueba';
