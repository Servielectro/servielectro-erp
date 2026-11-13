-- Verificación de la migración 151. Solo lee: correr ANTES (la primera consulta debe dar columna en
-- cero y los requisitos en 1) y DESPUÉS de aplicarla.

select
  (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'oportunidades' and column_name = 'origen_lead') as tiene_origen_lead,
  (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'oportunidades' and column_name = 'marketing_publicacion_id') as columna_nueva,
  (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'marketing_publicaciones' and column_name in ('idea_id', 'cuenta_id', 'publicado_en', 'url')) as columnas_publicacion_debe_dar_4,
  (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'etapas_config' and column_name = 'resultado') as etapas_con_resultado;

-- El CHECK existente de origen_lead y el nuevo, y la llave con su on delete (confdeltype 'n' = set null).
select conname, contype, confdeltype, pg_get_constraintdef(oid) as definicion
from pg_constraint
where conrelid = 'public.oportunidades'::regclass
  and (conname like '%origen_lead%' or conname like '%publicacion%');

-- Después de aplicar: debe dar 0 (nadie viola la coherencia).
select count(*) as incoherentes
from public.oportunidades
where marketing_publicacion_id is not null and origen_lead is distinct from 'redes_sociales';

-- Después de aplicar: security_invoker debe estar en las opciones de la vista.
select relname, reloptions from pg_class where oid = 'public.v_marketing_retorno'::regclass;

-- Después de aplicar: la serie debe salir en las publicaciones que tengan notas con «Serie X · …».
select publicacion_id, titulo, serie, guardados, comentarios, oportunidades, valor_estimado, ganadas, valor_ganado
from public.v_marketing_retorno
order by publicado_en desc
limit 20;
