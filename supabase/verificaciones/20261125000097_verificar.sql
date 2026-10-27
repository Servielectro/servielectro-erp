-- Verificación de la migración 97 (el mensaje "Para confirmar falta: …"). Correr DESPUÉS de la
-- migración, todo junto; después, volver a correr la de la 93 (su caso 2a tiene que dar OK).
-- Crea usuarios, un proyecto, un documento y un contrato de prueba; BORRA todo al final.
-- Todas las filas deben decir OK.
begin;

create temporary table resultado (orden serial, prueba text, esperado text, resultado text) on commit drop;
grant all on resultado to authenticated;
grant usage on sequence resultado_orden_seq to authenticated;

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

create or replace function pg_temp.como(p_usuario uuid)
returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_usuario, 'role', 'authenticated')::text, true);
$$;

-- P = Proyectos "responsable" (confirma).
insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000097a0', 'authenticated', 'authenticated', 'proy-resp.97@invalid.local')
on conflict (id) do nothing;
insert into roles (nombre) values ('__Proy resp 97__') on conflict (nombre) do nothing;
insert into permisos_rol (rol_id, modulo_id, nivel, ve_datos_sensibles)
select id, 'proyectos', 'responsable', false from roles where nombre = '__Proy resp 97__'
on conflict (rol_id, modulo_id) do nothing;
insert into perfiles (id, rol_id, nombre)
select '00000000-0000-0000-0000-0000000097a0', id, '__P 97__' from roles where nombre = '__Proy resp 97__'
on conflict (id) do update set rol_id = excluded.rol_id;
insert into proyectos (id, codigo, nombre) values ('00000000-0000-0000-0000-0000000097e0', '__PRY-97__', '__Obra prueba 97__')
on conflict (id) do nothing;
-- Un contrato con objeto, sin alcance, sin valor y sin documento.
insert into proyecto_contratos (id, proyecto_id, numero, objeto, plazo_cantidad, plazo_unidad, plazo_inicia)
values ('00000000-0000-0000-0000-0000000097f1', '00000000-0000-0000-0000-0000000097e0', 'CSE-97', 'Objeto de prueba', 12, 'dias_habiles', 'acta_inicio');

set local role authenticated;
select pg_temp.como('00000000-0000-0000-0000-0000000097a0');
insert into resultado (prueba, esperado, resultado)
select '1a confirmar con tres cosas faltando: dice cuáles, en orden', 'contiene: Para confirmar falta: alcance, valor total, el contrato firmado (documento).',
  pg_temp.intentar($q$update proyecto_contratos set estado = 'confirmado' where id = '00000000-0000-0000-0000-0000000097f1'$q$);
insert into resultado (prueba, esperado, resultado)
select '1b ya no sale el error de arreglo', 'false',
  (select (position('malformed array literal' in pg_temp.intentar($q$update proyecto_contratos set estado = 'confirmado' where id = '00000000-0000-0000-0000-0000000097f1'$q$)) > 0)::text);
reset role;

-- ============================================================ limpieza (admin)
delete from proyecto_contratos where id = '00000000-0000-0000-0000-0000000097f1';
delete from proyectos where id = '00000000-0000-0000-0000-0000000097e0';
delete from perfiles where id = '00000000-0000-0000-0000-0000000097a0';
delete from permisos_rol where rol_id in (select id from roles where nombre = '__Proy resp 97__');
delete from roles where nombre = '__Proy resp 97__';
delete from auth.users where id = '00000000-0000-0000-0000-0000000097a0';

select prueba, esperado, resultado,
  case
    when esperado like 'contiene: %' and position(substring(esperado from 11) in resultado) > 0 then 'OK'
    when esperado = resultado then 'OK'
    else 'REVISAR'
  end as estado
from resultado
order by orden;
