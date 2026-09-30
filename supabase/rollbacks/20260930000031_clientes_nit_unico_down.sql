drop index if exists uq_clientes_nit_base;
drop function if exists fn_buscar_o_crear_cliente(text, text);
create or replace function fn_buscar_o_crear_cliente(p_nombre text)
returns uuid language plpgsql as $$
declare v_cliente_id uuid;
begin
  select id into v_cliente_id from clientes where lower(nombre) = lower(trim(p_nombre)) limit 1;
  if v_cliente_id is null then
    insert into clientes (nombre) values (trim(p_nombre)) returning id into v_cliente_id;
  end if;
  return v_cliente_id;
end; $$;
drop function if exists fn_nit_base(text);
