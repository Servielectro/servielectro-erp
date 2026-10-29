-- Verificación de la migración 114. Correr DESPUÉS de la migración, todo junto. Crea dos equipos de
-- prueba y los BORRA al final. Antes de la 114, las pruebas 1 y 2 salen REVISAR.
begin;

create temporary table resultado (orden serial, prueba text, esperado text, resultado text) on commit drop;

insert into sst_equipos (id, codigo, clase, referencia, periodicidad_inspeccion_meses, confiabilidad) values
  ('00000000-0000-0000-0000-0000001110e1', '__EQ-111a__', 'arnes', 'prueba', 6, 'pendiente'),
  ('00000000-0000-0000-0000-0000001110e2', '__EQ-111b__', 'arnes', 'prueba', 12, 'pendiente')
on conflict (id) do nothing;

-- 1) Apto el 01/10, NO APTO el 15/10.
insert into sst_equipo_inspecciones (equipo_id, fecha, resultado, observaciones) values
  ('00000000-0000-0000-0000-0000001110e1', '2026-10-01', 'apto', null),
  ('00000000-0000-0000-0000-0000001110e1', '2026-10-15', 'no_apto', 'Absorbedor activado');
insert into resultado (prueba, esperado, resultado)
select '1 un "no apto" posterior quita la vigencia (consulta 20/10)', 'false',
  coalesce(fn_sst_equipo_vigente('00000000-0000-0000-0000-0000001110e1', '2026-10-20')::text, '(vacío)');
insert into resultado (prueba, esperado, resultado)
select '1b … pero antes del "no apto" estaba vigente (consulta 10/10)', 'true',
  coalesce(fn_sst_equipo_vigente('00000000-0000-0000-0000-0000001110e1', '2026-10-10')::text, '(vacío)');

-- 2) Apto el 01/03 (anual); se retira el 20/10.
insert into sst_equipo_inspecciones (equipo_id, fecha, resultado) values ('00000000-0000-0000-0000-0000001110e2', '2026-03-01', 'apto');
update sst_equipos set estado = 'retirado', fecha_retiro = '2026-10-20', motivo_retiro = 'Prueba 111' where id = '00000000-0000-0000-0000-0000001110e2';
insert into resultado (prueba, esperado, resultado)
select '2 retirado el 20/10: el permiso del 15/09 sigue válido', 'true',
  coalesce(fn_sst_equipo_vigente('00000000-0000-0000-0000-0000001110e2', '2026-09-15')::text, '(vacío)');
insert into resultado (prueba, esperado, resultado)
select '2b … y desde el retiro ya no', 'false',
  coalesce(fn_sst_equipo_vigente('00000000-0000-0000-0000-0000001110e2', '2026-10-25')::text, '(vacío)');

delete from sst_equipo_inspecciones where equipo_id in ('00000000-0000-0000-0000-0000001110e1', '00000000-0000-0000-0000-0000001110e2');
delete from sst_equipos where id in ('00000000-0000-0000-0000-0000001110e1', '00000000-0000-0000-0000-0000001110e2');

select prueba, esperado, resultado, case when esperado = resultado then 'OK' else 'REVISAR' end as estado
from resultado
order by orden;
