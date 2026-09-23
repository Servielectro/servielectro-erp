-- Módulo 1: Proyectos — RLS
-- Idempotente: se puede correr más de una vez sin romper.
-- Servielectro es de uso interno con pocos usuarios. Por ahora: cualquier usuario autenticado
-- tiene acceso completo (lectura/escritura). Si más adelante hay roles distintos (ej. solo
-- lectura para contador), se refinan estas políticas por tabla (ver docs §13 - pendientes).
--
-- ADVERTENCIA DE SEGURIDAD (revisar antes de dar de alta un segundo usuario):
-- esto le da acceso total a costos de compra, márgenes de línea, recargo de proyecto y
-- utilidad neta de TODAS las obras a cualquiera que inicie sesión, sin distinción de rol.
-- Aceptable con un solo usuario (Jhojan). En cuanto entre un comercial, técnico o cualquier
-- persona que no deba ver esa información financiera interna, hay que refinar esto ANTES
-- de crearle el usuario, no después.

do $$
declare
  t text;
begin
  for t in
    select unnest(array[
      'items_catalogo', 'items_precios_historico',
      'clientes',
      'cotizacion_consecutivos', 'cotizaciones', 'cotizacion_items',
      'proyectos', 'proyecto_ejecucion_items', 'hitos_cobro'
    ])
  loop
    execute format('alter table %I enable row level security;', t);
    execute format('drop policy if exists %I on %I;', t || '_authenticated_all', t);
    execute format(
      'create policy %I on %I for all to authenticated using (true) with check (true);',
      t || '_authenticated_all', t
    );
  end loop;
end $$;
