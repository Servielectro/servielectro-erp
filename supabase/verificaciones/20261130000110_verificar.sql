-- Verificación de la migración 110 (historia clínica reservada por restricción). Correr DESPUÉS de
-- la migración, todo junto. Corre como el rol con el que se abre el editor (postgres): justo el
-- camino por el que el trigger de la 107 dejaba entrar una historia clínica abierta. Crea un empleado
-- de prueba y lo BORRA al final.
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

insert into empleados (id, primer_nombre, primer_apellido, numero_documento, fecha_ingreso, salario_base)
values ('00000000-0000-0000-0000-0000001100e1', '__Prueba', '110__', '__110__', '2026-01-01', 1)
on conflict (id) do nothing;

insert into resultado (prueba, esperado, resultado)
select '1 como postgres, una historia clínica abierta REBOTA (antes entraba)', 'contiene: persona_documentos_historia_reservada',
  pg_temp.intentar($q$insert into persona_documentos (empleado_id, tipo, reservado) values ('00000000-0000-0000-0000-0000001100e1', 'historia_clinica', false)$q$);
insert into resultado (prueba, esperado, resultado)
select '2 reservada sí entra', 'aceptado (1 filas)',
  pg_temp.intentar($q$insert into persona_documentos (empleado_id, tipo, reservado) values ('00000000-0000-0000-0000-0000001100e1', 'historia_clinica', true)$q$);
insert into resultado (prueba, esperado, resultado)
select '3 y no se puede abrir después', 'contiene: persona_documentos_historia_reservada',
  pg_temp.intentar($q$update persona_documentos set reservado = false where empleado_id = '00000000-0000-0000-0000-0000001100e1' and tipo = 'historia_clinica'$q$);
insert into resultado (prueba, esperado, resultado)
select '4 en toda la base no hay historias clínicas abiertas', '0',
  (select count(*)::text from persona_documentos where tipo = 'historia_clinica' and not reservado);

delete from persona_documentos where empleado_id = '00000000-0000-0000-0000-0000001100e1';
delete from empleados where id = '00000000-0000-0000-0000-0000001100e1';

select prueba, esperado, resultado,
  case
    when esperado like 'contiene: %' and position(substring(esperado from 11) in resultado) > 0 then 'OK'
    when esperado = resultado then 'OK'
    else 'REVISAR'
  end as estado
from resultado
order by orden;
