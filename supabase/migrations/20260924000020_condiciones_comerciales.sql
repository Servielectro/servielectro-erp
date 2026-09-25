-- Módulo 1: Proyectos — condiciones comerciales del documento que recibe el cliente:
-- despacho/aprobación, datos bancarios y garantía (fijos, configuración de la empresa),
-- pólizas (catálogo seleccionable por cotización) y forma de pago (se deriva del esquema
-- de hitos ya existente, no se guarda aparte). Idempotente: se puede correr más de una vez.
--
-- Origen del texto fijo: hoja "FormatoCotizacion" del Excel real (CSE-026-151 Tintalá
-- Fase 6), filas 114 a 123. Transcrito literal, sin redactar de nuevo.
--
-- VISIÓN A FUTURO (Jhojan): estos datos + el RUT del cliente son los insumos para
-- generar el contrato de obra más adelante. Por eso van como datos estructurados
-- (tablas con columnas propias), no como un bloque de texto libre.

-- 1) Configuración fija de la empresa (despacho/aprobación, banco, garantía).
-- Tabla singleton: la constraint de la PK (boolean, solo puede ser `true`) garantiza que
-- nunca haya más de una fila.
create table if not exists configuracion_empresa (
  id boolean primary key default true check (id),
  texto_despacho_aprobacion text,
  banco_nombre text,
  banco_tipo_cuenta text,
  banco_numero_cuenta text,
  banco_titular text,
  texto_garantia text,
  texto_validez_oferta text,
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_configuracion_empresa_updated_at on configuracion_empresa;
create trigger trg_configuracion_empresa_updated_at
  before update on configuracion_empresa
  for each row execute function extensions.moddatetime(updated_at);

insert into configuracion_empresa (
  id, texto_despacho_aprobacion, banco_nombre, banco_tipo_cuenta, banco_numero_cuenta,
  banco_titular, texto_garantia, texto_validez_oferta
) values (
  true,
  'Precios y disponibilidad de productos pueden cambiar dependiendo de la tasa de cambio del dólar. El plazo de entrega solo será contado a partir de la presentación de los siguientes ítems:'
    || E'\n' || '1. Orden de entrega.'
    || E'\n' || '2. Depósito anticipo (mediante el comprobante de pago).'
    || E'\n' || '3. Aprobación del check-list con todas las configuraciones del producto.',
  'DAVIVIENDA',
  'Ahorros',
  '485900010995',
  'SERVICIOS ELECTRÓNICOS INDUSTRIALES SAS',
  '*12 (Doce) meses contra defectos de fabricación, contando la fecha de emisión e instalación desde que sean respetadas las especificaciones técnicas del interfaz y operación. '
    || '*No se dará garantía por manipulación por personal ajeno a nuestra compañía. '
    || '*No se dará garantía por daños ocasionados por eventos fortuitos ni de cambios elevados de voltaje en sistemas eléctricos no protegidos de las instalaciones del cliente. '
    || '*3 Meses en Casos de Mantenimiento Correctivo. '
    || '*Acompañamiento y servicio técnico inmediato (presencial —dependiendo de la ciudad—, por teléfono o celular o por acceso remoto). '
    || '*En cercados eléctricos: 1 Año de garantía por suministro de equipos y 6 meses de garantía por mano de obra e instalación. '
    || '*En cercados eléctricos: la compañía no se hace responsable por cambios climáticos y/o de salinidad en el ambiente que aceleren el proceso de oxidación de las partes metálicas de los cercados eléctricos.',
  'Esta propuesta tiene validez de 10 días, sujeta a alteraciones debido a la variación cambiaria del dólar.'
)
on conflict (id) do nothing;

-- 2) Catálogo de pólizas. Sin texto legal ni % / vigencia por defecto: el Excel real solo
-- nombra 3 pólizas ("manejo de anticipo", "garantía", "cumplimiento") sin cláusula ni
-- porcentaje asociado — no se inventa texto legal ni cifras. Jhojan completa esto cuando
-- tenga la redacción y los porcentajes reales de cada póliza.
create table if not exists polizas_catalogo (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  descripcion text,
  pct_default numeric(6,4),
  vigencia_meses_default int,
  activo boolean not null default true,
  orden int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_polizas_catalogo_updated_at on polizas_catalogo;
create trigger trg_polizas_catalogo_updated_at
  before update on polizas_catalogo
  for each row execute function extensions.moddatetime(updated_at);

insert into polizas_catalogo (nombre, orden) values
  ('Responsabilidad civil extracontractual', 1),
  ('Cumplimiento', 2),
  ('Garantía', 3),
  ('Salarios y prestaciones', 4),
  ('Anticipo', 5)
on conflict (nombre) do nothing;

-- 3) Pólizas seleccionadas por cotización (snapshot: nombre, %, vigencia al momento de
-- cotizar, igual que ya se hace con precios y descripción larga — si el catálogo cambia
-- después, la cotización ya guardada no se altera).
create table if not exists cotizacion_polizas (
  id uuid primary key default gen_random_uuid(),
  cotizacion_id uuid not null references cotizaciones (id) on delete cascade,
  poliza_id uuid references polizas_catalogo (id),
  nombre text not null,
  pct numeric(6,4),
  vigencia_meses int,
  orden int not null default 0,
  created_at timestamptz not null default now(),
  unique (cotizacion_id, poliza_id)
);

create index if not exists idx_cotizacion_polizas_cotizacion on cotizacion_polizas (cotizacion_id, orden);

-- RLS: mismo criterio permisivo que el resto del sistema (ver docs §13 - RLS pendiente
-- de refinar entre autenticados cuando haya un segundo usuario).
do $$
declare
  t text;
begin
  for t in select unnest(array['configuracion_empresa', 'polizas_catalogo', 'cotizacion_polizas'])
  loop
    execute format('alter table %I enable row level security;', t);
    execute format('drop policy if exists %I on %I;', t || '_authenticated_all', t);
    execute format(
      'create policy %I on %I for all to authenticated using (true) with check (true);',
      t || '_authenticated_all', t
    );
  end loop;
end $$;

-- Vista de pólizas por cotización, con el texto vigente del catálogo (para el documento).
-- security_invoker = true es obligatorio (ver 20260924000016): sin esto la vista ignora
-- la RLS y expone datos con la sola publishable key, sin sesión.
drop view if exists v_cotizacion_polizas;
create view v_cotizacion_polizas
with (security_invoker = true)
as
select
  cp.id,
  cp.cotizacion_id,
  cp.poliza_id,
  cp.nombre,
  cp.pct,
  cp.vigencia_meses,
  cp.orden,
  pc.descripcion
from cotizacion_polizas cp
left join polizas_catalogo pc on pc.id = cp.poliza_id
order by cp.cotizacion_id, cp.orden;

-- Extiende el guardado atómico para aceptar las pólizas seleccionadas. Agregar un
-- parámetro nuevo cambia la lista de tipos de la función, así que `create or replace`
-- NO reemplaza la versión de 20260924000018 en el mismo lugar — Postgres identifica una
-- función por su lista de tipos de argumentos, y una lista distinta crea una función
-- SOBRECARGADA aparte en vez de reemplazar, dejando las dos versiones coexistiendo.
-- Se dropea explícitamente la firma vieja primero (mismo patrón usado en
-- 20260923000013 al reemplazar la de 20260923000011) para no dejar un duplicado.
drop function if exists fn_guardar_cotizacion_completa(
  text, uuid, esquema_iva, text, numeric, numeric, numeric, numeric, numeric,
  jsonb, jsonb, text, text, text, text, text
);

create or replace function fn_guardar_cotizacion_completa(
  p_cliente_nombre text,
  p_cliente_id uuid,
  p_esquema_iva esquema_iva,
  p_descripcion text,
  p_pct_admin numeric,
  p_pct_imprevistos numeric,
  p_pct_utilidad_aiu numeric,
  p_pct_admin_gasto numeric,
  p_pct_comision numeric,
  p_lineas jsonb,
  p_hitos jsonb default null,
  p_comercial text default null,
  p_cliente_nit text default null,
  p_cliente_direccion text default null,
  p_cliente_email text default null,
  p_cliente_contacto text default null,
  p_polizas jsonb default null
)
returns uuid
language plpgsql
as $$
declare
  v_cliente_id uuid;
  v_anio smallint := extract(year from current_date);
  v_codigo text;
  v_cotizacion_id uuid;
  v_linea jsonb;
  v_hito jsonb;
  v_poliza jsonb;
  v_orden int := 0;
  v_compra_total numeric;
  v_venta_total numeric;
  v_pct_renta numeric;
  v_ica_por_mil numeric;
  v_iva_pct numeric;
  v_factor numeric;
  v_total_cotizacion numeric;
begin
  if p_lineas is null or jsonb_array_length(p_lineas) = 0 then
    raise exception 'La cotización necesita al menos una línea';
  end if;

  if p_cliente_id is not null then
    v_cliente_id := p_cliente_id;
  else
    select id into v_cliente_id from clientes where lower(nombre) = lower(trim(p_cliente_nombre)) limit 1;
    if v_cliente_id is null then
      insert into clientes (nombre, nit, direccion, email, contacto)
      values (trim(p_cliente_nombre), p_cliente_nit, p_cliente_direccion, p_cliente_email, p_cliente_contacto)
      returning id into v_cliente_id;
    end if;
  end if;

  update clientes set
    nit = coalesce(p_cliente_nit, nit),
    direccion = coalesce(p_cliente_direccion, direccion),
    email = coalesce(p_cliente_email, email),
    contacto = coalesce(p_cliente_contacto, contacto)
  where id = v_cliente_id
    and (p_cliente_nit is not null or p_cliente_direccion is not null
         or p_cliente_email is not null or p_cliente_contacto is not null);

  v_codigo := fn_siguiente_codigo_cotizacion(v_anio);

  insert into cotizaciones (
    codigo, anio, cliente_id, descripcion, esquema_iva, comercial,
    pct_admin, pct_imprevistos, pct_utilidad_aiu,
    pct_admin_gasto_interno, pct_comision_comercial
  ) values (
    v_codigo, v_anio, v_cliente_id, p_descripcion, p_esquema_iva, p_comercial,
    p_pct_admin, p_pct_imprevistos, p_pct_utilidad_aiu,
    p_pct_admin_gasto, p_pct_comision
  ) returning id into v_cotizacion_id;

  for v_linea in select * from jsonb_array_elements(p_lineas)
  loop
    v_orden := v_orden + 1;
    insert into cotizacion_items (
      cotizacion_id, item_catalogo_id, categoria, descripcion, descripcion_larga, unidad,
      cantidad, valor_compra_unitario, factor_rentabilidad_linea, orden
    ) values (
      v_cotizacion_id,
      nullif(v_linea->>'item_catalogo_id', '')::uuid,
      (v_linea->>'categoria')::categoria_item,
      v_linea->>'descripcion',
      nullif(v_linea->>'descripcion_larga', ''),
      v_linea->>'unidad',
      (v_linea->>'cantidad')::numeric,
      (v_linea->>'valor_compra_unitario')::numeric,
      (v_linea->>'factor_rentabilidad_linea')::numeric,
      v_orden
    );
  end loop;

  select coalesce(sum(valor_compra_unitario * cantidad), 0),
         coalesce(sum(valor_venta_unitario * cantidad), 0)
    into v_compra_total, v_venta_total
    from cotizacion_items where cotizacion_id = v_cotizacion_id;

  select pct_renta, ica_por_mil, iva_pct into v_pct_renta, v_ica_por_mil, v_iva_pct
    from cotizaciones where id = v_cotizacion_id;

  v_factor := fn_calcular_factor_recargo(
    v_compra_total, v_venta_total,
    p_pct_admin, p_pct_imprevistos, p_pct_utilidad_aiu,
    p_pct_admin_gasto, v_pct_renta, v_ica_por_mil, p_pct_comision, v_iva_pct,
    p_esquema_iva
  );

  update cotizaciones set factor_recargo_proyecto = v_factor where id = v_cotizacion_id;

  if p_hitos is not null and jsonb_array_length(p_hitos) > 0 then
    select total_cotizacion into v_total_cotizacion
      from v_cotizacion_totales_iva where cotizacion_id = v_cotizacion_id;

    v_orden := 0;
    for v_hito in select * from jsonb_array_elements(p_hitos)
    loop
      v_orden := v_orden + 1;
      insert into hitos_cobro (cotizacion_id, orden, nombre, porcentaje, valor_programado)
      values (
        v_cotizacion_id,
        v_orden,
        v_hito->>'nombre',
        (v_hito->>'porcentaje')::numeric,
        round((v_hito->>'porcentaje')::numeric * v_total_cotizacion, 2)
      );
    end loop;
  end if;

  if p_polizas is not null and jsonb_array_length(p_polizas) > 0 then
    v_orden := 0;
    for v_poliza in select * from jsonb_array_elements(p_polizas)
    loop
      v_orden := v_orden + 1;
      insert into cotizacion_polizas (cotizacion_id, poliza_id, nombre, pct, vigencia_meses, orden)
      values (
        v_cotizacion_id,
        nullif(v_poliza->>'poliza_id', '')::uuid,
        v_poliza->>'nombre',
        nullif(v_poliza->>'pct', '')::numeric,
        nullif(v_poliza->>'vigencia_meses', '')::int,
        v_orden
      );
    end loop;
  end if;

  return v_cotizacion_id;
end;
$$;
