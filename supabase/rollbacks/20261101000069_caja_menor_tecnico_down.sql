-- Rollback de 20261101000069 (caja menor del técnico). Vuelve a la caja menor de la 66: solo
-- RRHH, sin monto asignado, sin estado y sin anulación de líneas.
-- OJO: borra monto_asignado, estado y cierre de los recibos, y fecha, quién y anulación de las
-- líneas. Si hay líneas ANULADAS, se detiene sin cambiar nada: en la 66 una línea anulada
-- volvería a sumar como si fuera válida. Las fotos que hayan subido los técnicos quedan en
-- rrhh-soportes (caja-menor/): el almacenamiento se vacía solo por la API de Storage.

do $$
begin
  if exists (select 1 from public.caja_menor_lineas where anulada_en is not null) then
    raise exception 'Hay gastos de caja menor anulados: en la 66 volverían a contar. Resuélvalo antes de deshacer la 69.';
  end if;
end $$;

-- Storage: las funciones como quedaron en la 64.
create or replace function public.fn_rrhh_soporte_visible(p_nombre text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case split_part(p_nombre, '/', 1)
    when 'gastos' then exists (select 1 from gastos g where g.id = fn_rrhh_id_de_ruta(p_nombre)
                               and (g.persona_id = auth.uid() or fn_rrhh_ve_todo()))
    when 'abonos' then exists (select 1 from abonos a where a.id = fn_rrhh_id_de_ruta(p_nombre)
                               and (a.persona_id = auth.uid() or fn_rrhh_ve_todo() or fn_es_aprobador_rrhh('abonos')))
    -- El destinatario solo abre archivos que estén registrados como suyos y sin anular.
    when 'documentos' then fn_rrhh_ve_todo()
                           or exists (select 1 from documentos_personal d
                                      where d.persona_id = auth.uid() and d.anulado_en is null
                                        and (d.storage_path = p_nombre or d.firma_path = p_nombre))
    else false
  end;
$$;

-- Gasto: su dueño, mientras se pueda editar. Abono: el aprobador, antes del desembolso y
-- nunca sobre el suyo.
create or replace function public.fn_rrhh_soporte_subible(p_nombre text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case split_part(p_nombre, '/', 1)
    when 'gastos' then exists (select 1 from gastos g where g.id = fn_rrhh_id_de_ruta(p_nombre)
                               and g.persona_id = auth.uid() and g.estado <> 'anulado' and g.reembolsado_en is null)
    when 'abonos' then exists (select 1 from abonos a where a.id = fn_rrhh_id_de_ruta(p_nombre)
                               and a.estado in ('solicitado', 'aprobado') and a.persona_id <> auth.uid()
                               and fn_es_aprobador_rrhh('abonos'))
    -- Documento: RRHH, en la carpeta de una persona que existe. Firma: el destinatario, en
    -- su carpeta, de un documento suyo que la pide y aún no está firmado.
    when 'documentos' then
      case when split_part(p_nombre, '/', 3) = 'firmas' then
             exists (select 1 from documentos_personal d
                     where d.id = fn_rrhh_documento_de_firma(p_nombre)
                       and d.persona_id = auth.uid()
                       and split_part(p_nombre, '/', 2) = auth.uid()::text
                       and d.requiere_firma and d.firma_path is null and d.anulado_en is null)
           else fn_rrhh_ve_todo()
                and exists (select 1 from perfiles pf where pf.id = fn_rrhh_id_de_ruta(p_nombre))
      end
    else false
  end;
$$;

-- RLS: solo RRHH, como en la 66.
drop policy if exists caja_menor_recibos_select on public.caja_menor_recibos;
create policy caja_menor_recibos_select on public.caja_menor_recibos for select to authenticated using (fn_rrhh_ve_todo());
drop policy if exists caja_menor_lineas_select on public.caja_menor_lineas;
create policy caja_menor_lineas_select on public.caja_menor_lineas for select to authenticated using (fn_rrhh_ve_todo());
drop policy if exists caja_menor_lineas_insert on public.caja_menor_lineas;
create policy caja_menor_lineas_insert on public.caja_menor_lineas for insert to authenticated with check (fn_rrhh_ve_todo());
drop policy if exists caja_menor_lineas_update on public.caja_menor_lineas;
drop policy if exists caja_menor_soportes_select on public.caja_menor_soportes;
create policy caja_menor_soportes_select on public.caja_menor_soportes for select to authenticated using (fn_rrhh_ve_todo());
drop policy if exists caja_menor_soportes_insert on public.caja_menor_soportes;
create policy caja_menor_soportes_insert on public.caja_menor_soportes for insert to authenticated with check (fn_rrhh_ve_todo());

-- La vista de la 66 (total = suma de líneas).
drop view if exists public.v_caja_menor_recibos;

-- Triggers de la 66.
drop trigger if exists trg_caja_menor_recibos_reglas on public.caja_menor_recibos;
drop trigger if exists trg_caja_menor_recibos_anulable on public.caja_menor_recibos;
create trigger trg_caja_menor_recibos_anulable before update or delete on public.caja_menor_recibos
  for each row execute function public.fn_rrhh_registro_anulable();
drop trigger if exists trg_caja_menor_lineas_reglas on public.caja_menor_lineas;
drop trigger if exists trg_caja_menor_lineas_hijo on public.caja_menor_lineas;
create trigger trg_caja_menor_lineas_hijo before insert or update or delete on public.caja_menor_lineas
  for each row execute function public.fn_rrhh_hijo_de_registro();
drop trigger if exists trg_caja_menor_soportes_reglas on public.caja_menor_soportes;
drop trigger if exists trg_caja_menor_soportes_hijo on public.caja_menor_soportes;
create trigger trg_caja_menor_soportes_hijo before insert or update or delete on public.caja_menor_soportes
  for each row execute function public.fn_rrhh_hijo_de_registro();

drop function if exists public.fn_caja_menor_recibo_reglas();
drop function if exists public.fn_caja_menor_linea_reglas();
drop function if exists public.fn_caja_menor_soporte_reglas();

alter table public.caja_menor_soportes drop column if exists linea_id;
alter table public.caja_menor_lineas drop column if exists motivo_anulacion;
alter table public.caja_menor_lineas drop column if exists anulada_por;
alter table public.caja_menor_lineas drop column if exists anulada_en;
alter table public.caja_menor_lineas drop column if exists registrado_en;
alter table public.caja_menor_lineas drop column if exists registrado_por;
alter table public.caja_menor_lineas drop column if exists fecha;
alter table public.caja_menor_recibos drop constraint if exists caja_menor_estado;
alter table public.caja_menor_recibos drop constraint if exists caja_menor_monto_asignado;
alter table public.caja_menor_recibos drop column if exists cerrada_por;
alter table public.caja_menor_recibos drop column if exists cerrada_en;
alter table public.caja_menor_recibos drop column if exists estado;
alter table public.caja_menor_recibos drop column if exists monto_asignado;

create view public.v_caja_menor_recibos with (security_invoker = true) as
select r.*, coalesce((select sum(l.valor) from caja_menor_lineas l where l.recibo_id = r.id), 0) as total
from caja_menor_recibos r;
revoke all on public.v_caja_menor_recibos from anon;

drop function if exists public.fn_caja_menor_abierta(uuid);
drop function if exists public.fn_caja_menor_es_mia(uuid);
