-- Visitas: datos del sitio copiados en la visita.
--
-- El técnico (rol "Técnicos": solo tecnico/trabajar) NO puede leer clientes — esa tabla
-- exige comercial/consultar desde la tanda 2, y así debe seguir (NIT, RUT, datos
-- comerciales). Pero en campo necesita saber a quién visita y a quién llamar. Quien
-- asigna la visita (Operativo) copia acá el nombre del cliente y el contacto del sitio:
-- el técnico ve solo lo que necesita, también sin señal.
--
-- Sobre la tabla visitas creada en la migración 45 (sin drift posible: es de hoy y se
-- verificó). Idempotente.
-- Rollback: supabase/rollbacks/20261018000046_visitas_datos_del_sitio_down.sql

alter table public.visitas add column if not exists cliente_nombre text;
alter table public.visitas add column if not exists contacto_sitio text;
alter table public.visitas add column if not exists telefono_sitio text;

-- Técnicos a los que se puede asignar una visita. perfiles solo se lee a uno mismo o con
-- configuracion/responsable; un supervisor de Operativo no tiene por qué tener eso, pero
-- sí necesita la lista para asignar. Devuelve solo id y nombre.
create or replace function public.fn_tecnicos_asignables()
returns table (id uuid, nombre text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not fn_tiene_permiso('operativo', 'trabajar') then
    raise exception 'Asignar visitas requiere permiso de Operativo.';
  end if;
  return query
  select p.id, coalesce(p.nombre, '(sin nombre)')
  from perfiles p
  join permisos_rol pr on pr.rol_id = p.rol_id and pr.modulo_id = 'tecnico'
  where pr.nivel in ('trabajar', 'responsable')
  order by 2;
end;
$$;

revoke all on function public.fn_tecnicos_asignables() from public, anon;
grant execute on function public.fn_tecnicos_asignables() to authenticated;
