-- Clientes — un NIT, un cliente (pedido 2026-09-30, junto con el buscador de clientes
-- del armador, estilo Siigo).
--
-- Hasta hoy nada impedía que un mismo NIT quedara en dos registros: la búsqueda era
-- solo por nombre (fn_buscar_o_crear_cliente y el guardado de la cotización), y basta
-- escribir "Conjunto X" en vez de "CONJUNTO X PH" para duplicar.
--
-- 1) fn_nit_base(nit): el NIT comparable — solo los dígitos antes del dígito de
--    verificación ("900.123.456-7" → "900123456"). Así "900123456-7", "900.123.456-7"
--    y "900123456" son el mismo cliente.
-- 2) fn_buscar_o_crear_cliente(p_nombre, p_nit): busca primero por NIT, después por
--    nombre, y recién ahí crea. Reemplaza la versión de un solo parámetro (la llamada
--    existente con solo p_nombre sigue funcionando: p_nit tiene default).
-- 3) Índice único sobre fn_nit_base(nit): la base rechaza un segundo cliente con el
--    mismo NIT. Si YA hay duplicados cargados, el índice no se crea (la migración no
--    falla) y se listan en un NOTICE para unificarlos a mano; después se vuelve a correr.
--
-- Idempotente.

create or replace function fn_nit_base(p_nit text)
returns text
language sql
immutable
as $$
  select nullif(regexp_replace(split_part(coalesce(p_nit, ''), '-', 1), '[^0-9]', '', 'g'), '');
$$;

drop function if exists fn_buscar_o_crear_cliente(text);

create or replace function fn_buscar_o_crear_cliente(p_nombre text, p_nit text default null)
returns uuid
language plpgsql
as $$
declare
  v_cliente_id uuid;
  v_nit text := fn_nit_base(p_nit);
begin
  if v_nit is not null then
    select id into v_cliente_id from clientes where fn_nit_base(nit) = v_nit limit 1;
  end if;
  if v_cliente_id is null then
    select id into v_cliente_id from clientes where lower(nombre) = lower(trim(p_nombre)) limit 1;
  end if;
  if v_cliente_id is null then
    insert into clientes (nombre, nit) values (trim(p_nombre), nullif(trim(p_nit), ''))
    returning id into v_cliente_id;
  end if;
  return v_cliente_id;
end;
$$;

do $$
declare
  v_dup record;
  v_hay boolean := false;
begin
  for v_dup in
    select fn_nit_base(nit) as nit_base, count(*) as n, string_agg(nombre, ' | ') as nombres
    from clientes
    where fn_nit_base(nit) is not null
    group by fn_nit_base(nit)
    having count(*) > 1
  loop
    v_hay := true;
    raise notice 'NIT % repetido en % clientes: %', v_dup.nit_base, v_dup.n, v_dup.nombres;
  end loop;

  if v_hay then
    raise notice 'No se creó el índice único de NIT: hay duplicados (ver arriba). Unificarlos y volver a correr esta migración.';
  else
    execute 'create unique index if not exists uq_clientes_nit_base on clientes (fn_nit_base(nit)) where fn_nit_base(nit) is not null';
  end if;
end $$;
