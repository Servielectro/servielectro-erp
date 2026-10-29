-- Verificación de la migración 110. Correr DESPUÉS de la migración. No crea nada.
select prueba, esperado, resultado, case when esperado = resultado then 'OK' else 'REVISAR' end as estado
from (
  select '1 los 60 pesos de 2026 quedaron verificados' as prueba, '60 / 60' as esperado,
         (select count(*) filter (where valor_verificado)::text || ' / ' || count(*)::text
            from sst_plan_items where anio = 2026 and codigo is not null) as resultado
  union all
  select '2 el total ya no es provisional', 'true',
         coalesce((select pesos_verificados::text from v_sst_autoevaluacion_total where anio = 2026), '(vacío)')
  union all
  select '3 la suma sigue en 100', '100.00',
         (select sum(valor)::numeric(6,2)::text from sst_plan_items where anio = 2026 and codigo is not null)
) t;
