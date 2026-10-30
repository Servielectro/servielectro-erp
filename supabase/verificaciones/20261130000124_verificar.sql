-- Verificación de la migración 124. Correr DESPUÉS de la migración. No crea nada.
select prueba, esperado, resultado, case when esperado = resultado then 'OK' else 'REVISAR' end as estado
from (
  select '1 RLS activa en modulo_secciones' as prueba, 'true' as esperado,
         (select relrowsecurity::text from pg_class where oid = 'public.modulo_secciones'::regclass) as resultado
  union all
  select '2 authenticated lee pero no escribe', 'true / false / false / false',
         has_table_privilege('authenticated', 'public.modulo_secciones', 'select')::text || ' / ' ||
         has_table_privilege('authenticated', 'public.modulo_secciones', 'insert')::text || ' / ' ||
         has_table_privilege('authenticated', 'public.modulo_secciones', 'update')::text || ' / ' ||
         has_table_privilege('authenticated', 'public.modulo_secciones', 'delete')::text
  union all
  select '3 anon no la lee', 'false', has_table_privilege('anon', 'public.modulo_secciones', 'select')::text
  union all
  select '4 siguen las 39 secciones', '39', (select count(*)::text from public.modulo_secciones)
) t;
