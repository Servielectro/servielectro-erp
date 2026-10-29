-- Verificación de la migración 122. Correr DESPUÉS de la migración. No crea nada. Revisa que cada
-- ruta de v_vencimientos lleve a una pantalla que existe.
select prueba, esperado, resultado, case when esperado = '(informativo)' then 'INFO' when esperado = resultado then 'OK' else 'REVISAR' end as estado
from (
  select '1 ninguna ruta a las pantallas que no existen' as prueba, '0' as esperado,
         (select count(*)::text from v_vencimientos where ruta in ('/administrativo/contratistas', '/sgsst/personal')) as resultado
  union all
  select '2 los documentos de personas llevan a su ficha', '0',
         (select count(*)::text from v_vencimientos where origen_tabla in ('persona_documentos', 'epp_seguimiento') and ruta !~ '^/sgsst/personal/[ec]-[0-9a-f-]{36}$')
  union all
  select '3 los contratos laborales llevan al contrato', '0',
         (select count(*)::text from v_vencimientos where origen_tabla = 'contratos_laborales' and ruta !~ '^/rrhh/contratos/[0-9a-f-]{36}$')
  union all
  select '4 las tareas llevan a Operativo o a Planificación', '0',
         (select count(*)::text from v_vencimientos where origen_tabla = 'tareas' and ruta not in ('/operativo/tareas', '/planificacion'))
  union all
  select '5 rutas usadas hoy (para mirar)', '(informativo)',
         coalesce((select string_agg(distinct regexp_replace(ruta, '[0-9a-f-]{36}', '{id}'), ', ') from v_vencimientos), '(sin vencimientos)')
) t;
