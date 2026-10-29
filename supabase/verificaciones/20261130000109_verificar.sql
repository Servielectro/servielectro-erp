-- Verificación de la migración 109 (hojas de vida de equipos). Correr DESPUÉS de la migración,
-- todo junto. Son las pruebas que el orquestador corrió a mano al aplicarla. Crea un equipo de
-- prueba con sus inspecciones y lo BORRA al final.
-- (Dos casos que la 109 no cubría —un "no apto" posterior y un equipo retirado después— van en la
-- verificación de la 111, que los corrige.)
begin;

create temporary table resultado (orden serial, prueba text, esperado text, resultado text) on commit drop;

create or replace function pg_temp.intentar(p_sql text)
returns text language plpgsql as $$
declare n int;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return 'aceptado (' || n || ' filas)';
exception when others then
  return 'RECHAZADO [' || sqlstate || ']: ' || sqlerrm;
end $$;

create or replace function pg_temp.vigente(p_fecha date)
returns text language sql as $$
  select coalesce(fn_sst_equipo_vigente('00000000-0000-0000-0000-0000001090e1', p_fecha)::text, '(vacío)');
$$;

-- Un arnés de prueba con periodicidad de 6 meses.
insert into sst_equipos (id, codigo, clase, referencia, periodicidad_inspeccion_meses, confiabilidad)
values ('00000000-0000-0000-0000-0000001090e1', '__EQ-109__', 'arnes', 'prueba', 6, 'pendiente')
on conflict (id) do nothing;

-- ============================================================ A) sin inspección no se asume apto
insert into resultado (prueba, esperado, resultado)
select 'A sin inspección registrada NO está vigente', 'false', pg_temp.vigente('2026-03-01');

-- ============================================================ B, C, D) vigencia a una fecha
insert into sst_equipo_inspecciones (equipo_id, fecha, resultado) values ('00000000-0000-0000-0000-0000001090e1', '2026-01-10', 'apto');
insert into resultado (prueba, esperado, resultado)
select 'B vigente dentro de la periodicidad (inspección 10/01, consulta 01/03)', 'true', pg_temp.vigente('2026-03-01');
insert into resultado (prueba, esperado, resultado)
select 'C no vigente con la inspección vencida a esa fecha (consulta 01/08)', 'false', pg_temp.vigente('2026-08-01');
insert into sst_equipo_inspecciones (equipo_id, fecha, resultado) values ('00000000-0000-0000-0000-0000001090e1', '2026-10-01', 'apto');
insert into resultado (prueba, esperado, resultado)
select 'D una inspección de octubre no vuelve válido septiembre', 'false', pg_temp.vigente('2026-09-15');
insert into resultado (prueba, esperado, resultado)
select 'D2 … y sí cubre octubre', 'true', pg_temp.vigente('2026-10-15');

-- ============================================================ E) no apto no da vigencia
insert into sst_equipos (id, codigo, clase, referencia, confiabilidad)
values ('00000000-0000-0000-0000-0000001090e2', '__EQ-109b__', 'eslinga', 'prueba', 'pendiente') on conflict (id) do nothing;
insert into sst_equipo_inspecciones (equipo_id, fecha, resultado, observaciones)
values ('00000000-0000-0000-0000-0000001090e2', '2026-05-01', 'no_apto', 'Costura abierta');
insert into resultado (prueba, esperado, resultado)
select 'E una inspección "no apto" no otorga vigencia', 'false',
  coalesce(fn_sst_equipo_vigente('00000000-0000-0000-0000-0000001090e2', '2026-05-10')::text, '(vacío)');
insert into resultado (prueba, esperado, resultado)
select 'E2 "no apto" sin decir por qué', 'contiene: sst_equipo_inspecciones_motivo', pg_temp.intentar($q$
  insert into sst_equipo_inspecciones (equipo_id, fecha, resultado) values ('00000000-0000-0000-0000-0000001090e2', '2026-06-01', 'no_apto')$q$);

-- ============================================================ F) retirar exige fecha y motivo
insert into resultado (prueba, esperado, resultado)
select 'F retirar sin fecha ni motivo', 'contiene: sst_equipos_retiro_completo', pg_temp.intentar($q$
  update sst_equipos set estado = 'retirado' where id = '00000000-0000-0000-0000-0000001090e1'$q$);
insert into resultado (prueba, esperado, resultado)
select 'F2 retirar con fecha y motivo', 'aceptado (1 filas)', pg_temp.intentar($q$
  update sst_equipos set estado = 'retirado', fecha_retiro = '2026-10-20', motivo_retiro = 'Detuvo una caída' where id = '00000000-0000-0000-0000-0000001090e1'$q$);

-- ============================================================ G) siembra y privilegios
insert into resultado (prueba, esperado, resultado)
select 'G los dos equipos sembrados, como "informada"', 'EPCC-001 arnes informada, EPCC-002 eslinga informada',
  (select string_agg(codigo || ' ' || clase || ' ' || confiabilidad, ', ' order by codigo) from sst_equipos where codigo in ('EPCC-001', 'EPCC-002'));
insert into resultado (prueba, esperado, resultado)
select 'G2 anon no lee los equipos', 'false', has_table_privilege('anon', 'public.sst_equipos', 'select')::text;

-- ============================================================ limpieza
delete from sst_equipo_inspecciones where equipo_id in ('00000000-0000-0000-0000-0000001090e1', '00000000-0000-0000-0000-0000001090e2');
delete from sst_equipos where id in ('00000000-0000-0000-0000-0000001090e1', '00000000-0000-0000-0000-0000001090e2');

select prueba, esperado, resultado,
  case
    when esperado like 'contiene: %' and position(substring(esperado from 11) in resultado) > 0 then 'OK'
    when esperado = resultado then 'OK'
    else 'REVISAR'
  end as estado
from resultado
order by orden;
