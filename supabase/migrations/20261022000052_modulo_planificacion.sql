-- Módulo Planificación: la agenda de cada quien. Cualquiera con usuario la tiene, sin
-- permiso especial.
--
-- Cómo, sin romper el patrón de permisos (módulo + nivel en permisos_rol):
--   - modulos.para_todos: dato en la base, no un caso especial escondido en el código.
--     true = el módulo lo ve cualquiera con sesión, y NO lleva filas en permisos_rol (en
--     la matriz de Usuarios aparece como "Todos los usuarios", sin casillas).
--   - Abrir el módulo NO abre ningún dato: las políticas de las tareas internas dependen
--     de quién las creó (tareas_select: creada_por = auth.uid() …), no de un permiso de
--     módulo. La verificación lo prueba con un usuario sin ningún rol.
--
-- Sobre el estado real conocido (estado_previo_tecnico.sql, 2026-10-18): modulos(id text,
-- nombre text, orden int) con configuracion(0) … licitaciones(9). Planificación va al
-- final (10). Idempotente.
--
-- Verificación: supabase/verificaciones/20261022000052_verificar.sql
-- Rollback:     supabase/rollbacks/20261022000052_modulo_planificacion_down.sql

alter table public.modulos add column if not exists para_todos boolean not null default false;

insert into public.modulos (id, nombre, orden, para_todos)
values ('planificacion', 'Planificación', 10, true)
on conflict (id) do update set para_todos = true;

-- Un módulo para todos no lleva permisos por rol: si alguien los cargara por error, la
-- regla se volvería ambigua ("¿lo ve todos o solo ese rol?"). Se impide en la base.
create or replace function public.fn_permisos_rol_no_para_todos()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if exists (select 1 from modulos m where m.id = new.modulo_id and m.para_todos) then
    raise exception 'El módulo "%" es para todos los usuarios: no lleva permisos por rol.', new.modulo_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_permisos_rol_no_para_todos on public.permisos_rol;
create trigger trg_permisos_rol_no_para_todos before insert or update on public.permisos_rol
  for each row execute function public.fn_permisos_rol_no_para_todos();

-- Por si quedó alguna (no debería: el módulo es nuevo).
delete from public.permisos_rol pr
using public.modulos m
where m.id = pr.modulo_id and m.para_todos;
