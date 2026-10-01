-- Verificación de la migración 36 (Fase 2B, tanda 1). Correr DESPUÉS de la migración,
-- en el SQL Editor de Supabase, todo junto. NO deja cambios:
--   - cada escritura de prueba se deshace sola (se fuerza un error dentro de su bloque,
--     que revierte solo ese bloque);
--   - la tabla de resultados es temporal y desaparece al terminar.
--
-- Simula dos usuarios con el mismo mecanismo que usa la API (rol `authenticated` +
-- claims del JWT, de donde sale auth.uid()):
--   A) Jhojan  (696d9431-5c4d-4043-aee4-3e4597094f26, Administrador)  → debe ver TODO
--   B) usuario sin perfil ni rol (uuid inventado)                       → debe ver CERO
--
-- Resultado esperado: la tabla final con todas las filas en estado "OK".

begin;

create temporary table verificacion (prueba text, esperado text, obtenido text) on commit drop;
grant all on verificacion to authenticated;

-- Intenta una escritura y la deshace siempre. Devuelve 'permitido' o 'rechazado'.
create or replace function pg_temp.probar_escritura(p_sql text)
returns text language plpgsql as $$
begin
  begin
    execute p_sql;
    raise exception '__deshacer__';
  exception when others then
    if sqlerrm = '__deshacer__' then
      return 'permitido';
    end if;
    return 'rechazado';
  end;
end $$;

-- Cuántas filas cambiaría un UPDATE (y lo deshace): 0 = la RLS no lo deja ver.
create or replace function pg_temp.filas_update(p_sql text)
returns int language plpgsql as $$
declare n int;
begin
  begin
    execute p_sql;
    get diagnostics n = row_count;
    raise exception '__deshacer__';
  exception when others then
    if sqlerrm = '__deshacer__' then
      return n;
    end if;
    return -1;
  end;
end $$;

-- ============================================================ A) Jhojan
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"696d9431-5c4d-4043-aee4-3e4597094f26","role":"authenticated"}', true);

insert into verificacion
select 'Jhojan lee polizas_catalogo', '> 0', count(*)::text from polizas_catalogo
union all
select 'Jhojan lee valores_agregados_catalogo', '> 0', count(*)::text from valores_agregados_catalogo
union all
select 'Jhojan lee configuracion_empresa', '1', count(*)::text from configuracion_empresa
union all
select 'Jhojan crea póliza', 'permitido',
  pg_temp.probar_escritura($q$insert into polizas_catalogo (nombre) values ('__prueba_rls__')$q$)
union all
select 'Jhojan crea bloque del documento', 'permitido',
  pg_temp.probar_escritura($q$insert into valores_agregados_catalogo (titulo, texto) values ('__prueba_rls__', 'x')$q$)
union all
select 'Jhojan edita configuración (filas)', '1',
  pg_temp.filas_update($q$update configuracion_empresa set texto_validez_oferta = texto_validez_oferta where id$q$)::text;

-- ============================================================ B) usuario sin rol
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000b0","role":"authenticated"}', true);

insert into verificacion
select 'Sin rol lee polizas_catalogo', '0', count(*)::text from polizas_catalogo
union all
select 'Sin rol lee valores_agregados_catalogo', '0', count(*)::text from valores_agregados_catalogo
union all
select 'Sin rol lee configuracion_empresa', '0', count(*)::text from configuracion_empresa
union all
select 'Sin rol crea póliza', 'rechazado',
  pg_temp.probar_escritura($q$insert into polizas_catalogo (nombre) values ('__prueba_rls__')$q$)
union all
select 'Sin rol crea bloque del documento', 'rechazado',
  pg_temp.probar_escritura($q$insert into valores_agregados_catalogo (titulo, texto) values ('__prueba_rls__', 'x')$q$)
union all
select 'Sin rol edita configuración (filas)', '0',
  pg_temp.filas_update($q$update configuracion_empresa set texto_validez_oferta = texto_validez_oferta where id$q$)::text;

-- ============================================================ resultado (última instrucción)
reset role;
select prueba, esperado, obtenido,
  case
    when esperado = '> 0' and obtenido ~ '^[0-9]+$' and obtenido::int > 0 then 'OK'
    when esperado = obtenido then 'OK'
    else 'REVISAR'
  end as estado
from verificacion;
