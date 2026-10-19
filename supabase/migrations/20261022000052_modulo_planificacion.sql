-- Módulo Planificación: la agenda de tareas ADMINISTRATIVAS ("hacer una cotización", "un
-- documento", "registrar una factura para que no se me olvide").
--
-- Decisión de Jhojan (2026-10-22), que corrige la versión anterior de este archivo (nunca
-- se corrió): la agenda NO es para todos.
--   - Administrador y Coordinador la tienen (el coordinador también hace administrativo:
--     informes, órdenes de compra de material).
--   - Los técnicos NO tienen agenda: su agendamiento es lo que les asignan (visitas,
--     mantenimientos, tareas de obra), y eso vive en /tecnico.
--   - Es un módulo con permiso normal (módulo + nivel en permisos_rol). No hay ningún
--     mecanismo "para todos" en la base.
--
-- Y la base lo exige, no solo el menú: crear una tarea de agenda (visibilidad "interna")
-- pide planificacion/trabajar. Antes (migración 50) cualquiera con sesión podía crear
-- internas; con esto, un técnico o un usuario sin rol no puede, aunque llame a la API.
-- Lo que ya existiera se sigue viendo igual (la lectura no cambia: quien la creó).
--
-- Sobre el estado real conocido: modulos(id text, nombre text, orden int) con
-- configuracion(0) … licitaciones(9); roles Administrador, Coordinador y Técnicos;
-- permisos_rol con clave (rol_id, modulo_id). Idempotente.
--
-- Verificación: supabase/verificaciones/20261022000052_verificar.sql
-- Rollback:     supabase/rollbacks/20261022000052_modulo_planificacion_down.sql

insert into public.modulos (id, nombre, orden)
values ('planificacion', 'Planificación', 10)
on conflict (id) do nothing;

-- Administrador: responsable (como en todos los módulos). Coordinador: trabajar.
insert into public.permisos_rol (rol_id, modulo_id, nivel, ve_datos_sensibles)
select r.id, 'planificacion', p.nivel::nivel_permiso, p.sensibles
from public.roles r
join (values ('Administrador', 'responsable', true), ('Coordinador', 'trabajar', false)) as p(rol, nivel, sensibles)
  on p.rol = r.nombre
on conflict (rol_id, modulo_id) do nothing;

-- Crear tareas: las de agenda (internas) con Planificación; las de obra (equipo) con
-- Operativo, como antes.
drop policy if exists tareas_insert on public.tareas;
create policy tareas_insert on public.tareas for insert to authenticated
  with check (
    creada_por = auth.uid()
    and (
      (visibilidad = 'interna' and fn_tiene_permiso('planificacion', 'trabajar'))
      or (visibilidad = 'equipo' and fn_tiene_permiso('operativo', 'trabajar'))
    )
  );
