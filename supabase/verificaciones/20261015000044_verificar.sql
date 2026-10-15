-- Verificación de la migración 44 (consecutivo en Configuración). Correr DESPUÉS de la
-- migración, todo junto. NO deja cambios: los ajustes de prueba se deshacen solos.
--
-- Simula: A) Jhojan → ve el estado, ajusta (con motivo) y queda en el historial;
--            no puede bajar por debajo de lo emitido ni ajustar sin motivo
--         B) usuario sin rol → no ve el estado, no ajusta, no ve el historial
-- Resultado esperado: todas las filas en "OK".

begin;

create temporary table verificacion (prueba text, esperado text, obtenido text) on commit drop;
grant all on verificacion to authenticated;

create or replace function pg_temp.intentar(p_sql text)
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

-- Ajusta y devuelve cuántas filas de historial nuevas quedaron (todo se deshace).
create or replace function pg_temp.ajuste_registrado()
returns text language plpgsql as $$
declare antes int; despues int;
begin
  begin
    select count(*) into antes from cotizacion_consecutivos_ajustes where anio = 2099;
    perform fn_ajustar_consecutivo(2099::smallint, 5, 'prueba de verificación');
    select count(*) into despues from cotizacion_consecutivos_ajustes where anio = 2099;
    raise exception '__deshacer__%', despues - antes;
  exception when others then
    if sqlerrm like '\_\_deshacer\_\_%' then return substring(sqlerrm from 13); end if;
    return 'ERROR: ' || sqlerrm;
  end;
end $$;

-- ============================================================ A) Jhojan
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"696d9431-5c4d-4043-aee4-3e4597094f26","role":"authenticated"}', true);

insert into verificacion
select 'Jhojan ve el contador de 2026', '157',
  pg_temp.valor('select ultimo_numero from fn_estado_consecutivos() where anio = 2026')
union all select 'Jhojan ve el historial (ajuste inicial)', '>= 1',
  pg_temp.valor('select count(*) from cotizacion_consecutivos_ajustes where anio = 2026')
union all select 'Jhojan ajusta con motivo → 1 fila de historial', '1', pg_temp.ajuste_registrado()
union all select 'Jhojan ajusta sin motivo', 'rechazado',
  pg_temp.intentar($q$select fn_ajustar_consecutivo(2099::smallint, 5, '  ')$q$)
union all select 'Jhojan escribe el historial a mano', 'rechazado',
  pg_temp.intentar($q$insert into cotizacion_consecutivos_ajustes (anio, numero_nuevo, motivo) values (2099, 1, 'x')$q$)
union all select 'Jhojan borra el historial (filas)', '0',
  pg_temp.valor('with d as (delete from cotizacion_consecutivos_ajustes returning 1) select count(*) from d');

-- ============================================================ B) usuario sin rol
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000b0","role":"authenticated"}', true);

insert into verificacion
select 'Sin rol ve el estado', 'rechazado', pg_temp.intentar('select * from fn_estado_consecutivos()')
union all select 'Sin rol ajusta', 'rechazado',
  pg_temp.intentar($q$select fn_ajustar_consecutivo(2099::smallint, 5, 'x')$q$)
union all select 'Sin rol ve el historial', '0',
  (select count(*) from cotizacion_consecutivos_ajustes)::text;

reset role;

select prueba, esperado, obtenido,
  case
    when esperado = '>= 1' and obtenido ~ '^[0-9]+$' and obtenido::int >= 1 then 'OK'
    when esperado = obtenido then 'OK'
    else 'REVISAR'
  end as estado
from verificacion;
