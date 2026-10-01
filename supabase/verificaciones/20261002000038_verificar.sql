-- Verificación de la migración 38 (Fase 2B, tanda 2). Correr DESPUÉS de la migración,
-- en el SQL Editor de Supabase, todo junto. NO deja cambios:
--   - inserta un cliente, un negocio y un seguimiento DE PRUEBA (como administrador, para
--     que "el usuario sin rol ve 0 filas" signifique algo aunque una tabla esté vacía) y
--     los BORRA antes de mostrar el resultado;
--   - cada escritura de prueba como usuario se deshace sola;
--   - la tabla de resultados es temporal.
--
-- Simula: A) Jhojan (696d9431-5c4d-4043-aee4-3e4597094f26) → ve y escribe todo
--         B) usuario sin perfil ni rol                      → ve 0 y no escribe nada
-- Y revisa que en las tablas de las tandas 1 y 2 no quede NINGUNA política using (true).
--
-- Resultado esperado: todas las filas en estado "OK".

begin;

create temporary table verificacion (prueba text, esperado text, obtenido text) on commit drop;
grant all on verificacion to authenticated;

create or replace function pg_temp.probar_escritura(p_sql text)
returns text language plpgsql as $$
begin
  begin
    execute p_sql;
    raise exception '__deshacer__';
  exception when others then
    if sqlerrm = '__deshacer__' then return 'permitido'; end if;
    return 'rechazado';
  end;
end $$;

create or replace function pg_temp.filas(p_sql text)
returns int language plpgsql as $$
declare n int;
begin
  begin
    execute p_sql;
    get diagnostics n = row_count;
    raise exception '__deshacer__';
  exception when others then
    if sqlerrm = '__deshacer__' then return n; end if;
    return -1;
  end;
end $$;

create or replace function pg_temp.valor(p_sql text)
returns text language plpgsql as $$
declare v text;
begin
  begin
    execute p_sql into v;
    return v;
  exception when others then
    return 'ERROR: ' || sqlerrm;
  end;
end $$;

-- ============================================================ datos de prueba (admin)
insert into clientes (id, nombre) values ('00000000-0000-0000-0000-00000000c138', '__prueba_rls_38__');
insert into oportunidades (id, nombre, cliente_id, etapa_id)
values ('00000000-0000-0000-0000-00000000a138', '__prueba_rls_38__', '00000000-0000-0000-0000-00000000c138', 'solicitud');
insert into oportunidad_contactos (oportunidad_id, fecha_programada)
values ('00000000-0000-0000-0000-00000000a138', current_date);

-- ============================================================ A) Jhojan
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"696d9431-5c4d-4043-aee4-3e4597094f26","role":"authenticated"}', true);

insert into verificacion
select 'Jhojan lee clientes', '> 0', count(*)::text from clientes
union all select 'Jhojan lee oportunidades', '> 0', count(*)::text from oportunidades
union all select 'Jhojan lee oportunidad_contactos', '> 0', count(*)::text from oportunidad_contactos
union all select 'Jhojan lee oportunidad_etapas_historial', '> 0', count(*)::text from oportunidad_etapas_historial
union all select 'Jhojan lee etapas_config', '> 0', count(*)::text from etapas_config
union all select 'Jhojan lee documentos (sin error)', '>= 0', pg_temp.valor('select count(*) from documentos')
union all select 'Jhojan lee RUT en Storage (sin error)', '>= 0',
  pg_temp.valor($q$select count(*) from storage.objects where bucket_id = 'documentos-clientes'$q$)
union all select 'Jhojan crea cliente', 'permitido',
  pg_temp.probar_escritura($q$insert into clientes (nombre) values ('__prueba_rls_38_b__')$q$)
union all select 'Jhojan crea negocio', 'permitido',
  pg_temp.probar_escritura($q$insert into oportunidades (nombre, cliente_id, etapa_id) values ('__x__', '00000000-0000-0000-0000-00000000c138', 'solicitud')$q$)
union all select 'Jhojan mueve etapa del negocio (filas)', '1',
  pg_temp.filas($q$update oportunidades set etapa_id = 'visita_tecnica' where id = '00000000-0000-0000-0000-00000000a138'$q$)::text
union all select 'Jhojan edita umbrales de etapas (filas)', '15',
  pg_temp.filas($q$update etapas_config set orden = orden$q$)::text
union all select 'Jhojan NO borra historial (filas)', '0',
  pg_temp.filas($q$delete from oportunidad_etapas_historial where oportunidad_id = '00000000-0000-0000-0000-00000000a138'$q$)::text
union all select 'Jhojan ejecuta renovaciones (sin error)', '>= 0',
  pg_temp.valor('select fn_crear_renovaciones_pendientes()');

-- ============================================================ B) usuario sin rol
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000b0","role":"authenticated"}', true);

insert into verificacion
select 'Sin rol lee clientes', '0', count(*)::text from clientes
union all select 'Sin rol lee oportunidades', '0', count(*)::text from oportunidades
union all select 'Sin rol lee oportunidad_contactos', '0', count(*)::text from oportunidad_contactos
union all select 'Sin rol lee oportunidad_etapas_historial', '0', count(*)::text from oportunidad_etapas_historial
union all select 'Sin rol lee etapas_config', '0', count(*)::text from etapas_config
union all select 'Sin rol lee documentos', '0', count(*)::text from documentos
union all select 'Sin rol lee RUT en Storage', '0',
  (select count(*) from storage.objects where bucket_id = 'documentos-clientes')::text
union all select 'Sin rol crea cliente', 'rechazado',
  pg_temp.probar_escritura($q$insert into clientes (nombre) values ('__prueba_rls_38_c__')$q$)
union all select 'Sin rol edita negocio (filas)', '0',
  pg_temp.filas($q$update oportunidades set nombre = nombre where id = '00000000-0000-0000-0000-00000000a138'$q$)::text
union all select 'Sin rol crea renovaciones', '0',
  pg_temp.valor('select fn_crear_renovaciones_pendientes()');

-- ============================================================ políticas abiertas
reset role;
insert into verificacion
select 'Políticas using(true) en tablas de tandas 1 y 2', '0', count(*)::text
from pg_policies
where schemaname = 'public'
  and tablename = any (array['polizas_catalogo', 'valores_agregados_catalogo', 'configuracion_empresa',
                             'clientes', 'documentos', 'oportunidades', 'oportunidad_contactos',
                             'oportunidad_etapas_historial', 'etapas_config'])
  and (trim(coalesce(qual, '')) = 'true' or trim(coalesce(with_check, '')) = 'true');

-- ============================================================ limpieza de los datos de prueba
delete from oportunidades where id = '00000000-0000-0000-0000-00000000a138'; -- borra en cascada contactos e historial
delete from clientes where id = '00000000-0000-0000-0000-00000000c138';

-- ============================================================ resultado (última instrucción)
select prueba, esperado, obtenido,
  case
    when esperado = '> 0' and obtenido ~ '^[0-9]+$' and obtenido::int > 0 then 'OK'
    when esperado = '>= 0' and obtenido ~ '^[0-9]+$' then 'OK'
    when esperado = obtenido then 'OK'
    else 'REVISAR'
  end as estado
from verificacion;
