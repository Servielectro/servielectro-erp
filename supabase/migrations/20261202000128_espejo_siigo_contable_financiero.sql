-- Espejo de Siigo: módulos Contable y Financiero (2026-11-01).
-- Escrita y aplicada por el orquestador. Idempotente.
--
-- Jhojan, después de reunirse con la contadora: "que desde el ERP sea todo solo lectura y que
-- traiga todo... desde Siigo se sigue facturando y la contadora desde ahí tiene sus documentos
-- legales, porque el ERP no puede ser una representación legal ante documentos fiscales".
--
-- ============================================================================================
-- REGLA DE ORO DE ESTE MÓDULO: ESTO ES UN ESPEJO DE SOLO LECTURA.
--
-- La contabilidad de Siigo es el registro legal: de ahí salen las declaraciones a la DIAN y eso
-- es lo que firma la contadora. Si el ERP dejara editar estos datos, en tres meses habría dos
-- verdades y nadie sabría cuál es la buena, hasta que una no cuadre con lo declarado.
--
-- Por eso, a `authenticated` se le da SOLO SELECT. Escribe únicamente el proceso de
-- sincronización (service_role / postgres). No es una convención: está en los privilegios.
--
-- Todas las tablas llevan `siigo_` adelante para que la frontera se vea de lejos, y
-- `sincronizado_en` para que ninguna pantalla muestre un saldo sin decir de cuándo es. Un balance
-- sin fecha de corte es un número suelto.
-- ============================================================================================
--
-- ------------------------------------------------------------------ el IVA, y por qué es configurable
-- Toda la posición de IVA vive en la cuenta 2408 del PUC ("Impuesto sobre las ventas por pagar"):
-- se acredita con el IVA generado en ventas y se debita con el descontable de compras y con lo
-- pagado a la DIAN. El saldo ES lo que se debe.
--
-- PERO el PUC **no define subcuentas estándar** para separar generado de descontable: unas
-- empresas usan 240805 para generado y 240810 para descontable, y otras al revés. Quemar esos
-- números en el código haría que el tablero muestre un IVA equivocado con cara de correcto, que
-- es la peor forma de equivocarse con un impuesto.
--
-- Por eso van en `siigo_config` como arreglos configurables: se leen del plan de cuentas real de
-- Servielectro y se confirman con la contadora UNA vez.
--
-- ------------------------------------------------------------------ lo que todavía no se sabe
--   * El plan de Siigo (Jhojan cree que Premium, sin confirmar). La API va en profesional
--     independiente, emprendedor o premium.
--   * Las credenciales y el Partner-Id registrado.
--   * Los cortes exactos del cuatrimestre: hay que confirmarlos contra el calendario de la DIAN.
--     Por eso `periodicidad_iva` es un dato, no una constante en el código.
-- Nada de eso bloquea esta migración: la estructura se puede ver y revisar sin conexión.

-- ============================================================ 1) configuración y bitácora
create table if not exists public.siigo_config (
  id                     int primary key default 1 check (id = 1),
  usuario_api            text,
  partner_id             text,
  plan                   text,
  -- Subcuentas del PUC, leídas del plan de cuentas real. NO se adivinan.
  cuentas_iva_generado    text[] not null default '{}',
  cuentas_iva_descontable text[] not null default '{}',
  periodicidad_iva       text not null default 'cuatrimestral'
                         check (periodicidad_iva in ('bimestral','cuatrimestral')),
  cuentas_confirmadas_por uuid references public.perfiles (id),
  cuentas_confirmadas_en  timestamptz,
  activo                 boolean not null default false,
  notas                  text,
  updated_at             timestamptz not null default now()
);
comment on table public.siigo_config is
  'Configuracion de la conexion con Siigo. La clave NO va aqui: va en Vault. Las cuentas de IVA se confirman con la contadora.';
insert into public.siigo_config (id, notas) values
  (1, 'Pendiente: confirmar plan de Siigo, generar credenciales con usuario Administrador y registrar la aplicacion para obtener Partner-Id.')
on conflict (id) do nothing;

create table if not exists public.siigo_sincronizaciones (
  id           uuid primary key default gen_random_uuid(),
  recurso      text not null,
  desde        date,
  hasta        date,
  iniciada_en  timestamptz not null default now(),
  terminada_en timestamptz,
  filas        int,
  estado       text not null default 'corriendo' check (estado in ('corriendo','ok','error','parcial')),
  detalle      text,
  constraint siigo_sinc_error check (estado <> 'error' or nullif(trim(detalle),'') is not null)
);
create index if not exists idx_siigo_sinc on public.siigo_sincronizaciones (recurso, iniciada_en desc);

-- ============================================================ 2) terceros
create table if not exists public.siigo_terceros (
  siigo_id         text primary key,
  identificacion   text not null,
  dv               text,
  tipo_persona     text,
  tipo_documento   text,
  nombre           text not null,
  nombre_comercial text,
  es_cliente       boolean not null default false,
  es_proveedor     boolean not null default false,
  correo           text,
  telefono         text,
  ciudad           text,
  activo           boolean not null default true,
  sucursal         int,
  -- cruce con el ERP, por NIT; null = ese tercero no existe de este lado
  cliente_id       uuid references public.clientes (id),
  crudo            jsonb,
  sincronizado_en  timestamptz not null default now()
);
create index if not exists idx_siigo_terceros_ident on public.siigo_terceros (identificacion);
create index if not exists idx_siigo_terceros_rol on public.siigo_terceros (es_cliente, es_proveedor) where activo;

-- ============================================================ 3) facturación
create table if not exists public.siigo_facturas (
  siigo_id        text primary key,
  tipo            text not null check (tipo in ('venta','compra','nota_credito','documento_soporte')),
  numero          text,
  prefijo         text,
  fecha           date not null,
  tercero_id      text references public.siigo_terceros (siigo_id),
  identificacion  text,
  subtotal        numeric(16,2),
  descuento       numeric(16,2),
  impuestos       numeric(16,2),
  total           numeric(16,2),
  saldo           numeric(16,2),
  estado          text,
  cufe            text,
  -- cruce opcional con la operación propia
  proyecto_id     uuid references public.proyectos (id),
  cotizacion_id   uuid references public.cotizaciones (id),
  crudo           jsonb,
  sincronizado_en timestamptz not null default now()
);
create index if not exists idx_siigo_facturas_fecha on public.siigo_facturas (tipo, fecha desc);
create index if not exists idx_siigo_facturas_tercero on public.siigo_facturas (tercero_id, fecha desc);

create table if not exists public.siigo_factura_items (
  id              uuid primary key default gen_random_uuid(),
  factura_id      text not null references public.siigo_facturas (siigo_id) on delete cascade,
  linea           int,
  codigo          text,
  descripcion     text,
  cantidad        numeric(16,4),
  valor_unitario  numeric(16,2),
  descuento       numeric(16,2),
  impuestos       numeric(16,2),
  total           numeric(16,2),
  unique (factura_id, linea)
);
create index if not exists idx_siigo_items_codigo on public.siigo_factura_items (codigo);

-- ============================================================ 4) balances y cartera
-- El balance de prueba llega como Excel y se vuelca aquí fila por fila.
create table if not exists public.siigo_balance (
  id              uuid primary key default gen_random_uuid(),
  anio            int not null,
  -- 1 a 13: el 13 es el cierre contable, no un mes del calendario.
  mes             int not null check (mes between 1 and 13),
  cuenta          text not null,
  nombre_cuenta   text,
  saldo_inicial   numeric(18,2),
  debitos         numeric(18,2),
  creditos        numeric(18,2),
  saldo_final     numeric(18,2),
  -- null = balance general; con valor = balance por tercero
  identificacion  text,
  nombre_tercero  text,
  archivo_url     text,
  sincronizado_en timestamptz not null default now(),
  unique (anio, mes, cuenta, identificacion)
);
create index if not exists idx_siigo_balance on public.siigo_balance (anio, mes, cuenta);
create index if not exists idx_siigo_balance_tercero on public.siigo_balance (identificacion, anio, mes)
  where identificacion is not null;

create table if not exists public.siigo_cuentas_por_pagar (
  id              uuid primary key default gen_random_uuid(),
  siigo_doc_id    text,
  identificacion  text not null,
  nombre_tercero  text,
  sucursal        int,
  documento       text,
  fecha           date,
  vence_el        date,
  valor           numeric(16,2),
  saldo           numeric(16,2),
  crudo           jsonb,
  sincronizado_en timestamptz not null default now(),
  unique (siigo_doc_id)
);
create index if not exists idx_siigo_cxp_vence on public.siigo_cuentas_por_pagar (vence_el) where saldo > 0;

-- ============================================================ 5) lo que se ve en pantalla
-- Ventas por día, mes, bimestre y año. Un solo lugar, se filtra por `grano`.
create or replace view public.v_siigo_ventas
with (security_invoker = true) as
with f as (
  select fecha, total, impuestos, subtotal, tercero_id, identificacion
  from public.siigo_facturas where tipo = 'venta'
)
select 'dia'::text as grano, fecha::text as periodo, fecha as inicio,
       count(*) as facturas, sum(subtotal) as base, sum(impuestos) as impuestos, sum(total) as total
from f group by fecha
union all
select 'mes', to_char(fecha,'YYYY-MM'), date_trunc('month',fecha)::date,
       count(*), sum(subtotal), sum(impuestos), sum(total) from f group by 2,3
union all
select 'bimestre', to_char(fecha,'YYYY')||'-B'||(((extract(month from fecha)::int-1)/2)+1)::text,
       make_date(extract(year from fecha)::int, ((extract(month from fecha)::int-1)/2)*2+1, 1),
       count(*), sum(subtotal), sum(impuestos), sum(total) from f group by 2,3
union all
select 'cuatrimestre', to_char(fecha,'YYYY')||'-C'||(((extract(month from fecha)::int-1)/4)+1)::text,
       make_date(extract(year from fecha)::int, ((extract(month from fecha)::int-1)/4)*4+1, 1),
       count(*), sum(subtotal), sum(impuestos), sum(total) from f group by 2,3
union all
select 'anio', to_char(fecha,'YYYY'), make_date(extract(year from fecha)::int,1,1),
       count(*), sum(subtotal), sum(impuestos), sum(total) from f group by 2,3;

comment on view public.v_siigo_ventas is
  'Cuanto se vendio, por dia / mes / bimestre / cuatrimestre / anio. Sale de las facturas de venta de Siigo.';

-- Qué se vendió y a quién.
create or replace view public.v_siigo_ventas_por_item
with (security_invoker = true) as
select i.codigo, i.descripcion,
       count(distinct f.siigo_id) as facturas,
       sum(i.cantidad) as cantidad,
       sum(i.total) as total,
       min(f.fecha) as primera, max(f.fecha) as ultima
from public.siigo_factura_items i
join public.siigo_facturas f on f.siigo_id = i.factura_id and f.tipo = 'venta'
group by i.codigo, i.descripcion;

create or replace view public.v_siigo_ventas_por_cliente
with (security_invoker = true) as
select coalesce(t.nombre, f.identificacion) as cliente, f.identificacion,
       t.cliente_id,
       count(*) as facturas, sum(f.total) as total,
       min(f.fecha) as primera, max(f.fecha) as ultima
from public.siigo_facturas f
left join public.siigo_terceros t on t.siigo_id = f.tercero_id
where f.tipo = 'venta'
group by 1,2,3;

-- EL IVA. Lee las subcuentas configuradas, no unas quemadas.
-- Las subcuentas se guardan como arreglo en siigo_config y pueden llevar comodín (ej. '2408%').
-- Se cruza la configuración una vez y se compara con `exists`, no con `like any (subconsulta)`,
-- que en Postgres espera un conjunto de filas y no un arreglo.
create or replace view public.v_siigo_iva
with (security_invoker = true) as
select b.anio,
       case c.periodicidad_iva
         when 'bimestral' then 'B'||(((b.mes-1)/2)+1)::text
         else 'C'||(((b.mes-1)/4)+1)::text
       end as periodo,
       sum(b.creditos) filter (
         where exists (select 1 from unnest(c.cuentas_iva_generado) g where b.cuenta like g)
       ) as iva_generado,
       sum(b.debitos) filter (
         where exists (select 1 from unnest(c.cuentas_iva_descontable) d where b.cuenta like d)
       ) as iva_descontable,
       max(b.sincronizado_en) as al_corte
from public.siigo_balance b
cross join public.siigo_config c
where c.id = 1 and b.identificacion is null and b.mes between 1 and 12
group by 1,2;

comment on view public.v_siigo_iva is
  'Posicion de IVA por periodo. iva_generado - iva_descontable = lo que se debe. Vacio hasta que se configuren las subcuentas en siigo_config.';

-- Dónde no cuadra el ERP con Siigo. Lo primero que va a aparecer cuando sincronice.
create or replace view public.v_siigo_terceros_sin_cruzar
with (security_invoker = true) as
select 'solo_en_siigo'::text as donde, t.identificacion, t.nombre, null::uuid as cliente_id
from public.siigo_terceros t
where t.es_cliente and t.activo and t.cliente_id is null
union all
select 'solo_en_erp', c.nit, c.nombre, c.id
from public.clientes c
where not exists (select 1 from public.siigo_terceros t
                  where regexp_replace(coalesce(t.identificacion,''),'\D','','g')
                      = regexp_replace(coalesce(c.nit,''),'\D','','g'));

-- ============================================================ 6) permisos: SOLO LECTURA
do $$
declare t text;
begin
  foreach t in array array['siigo_config','siigo_sincronizaciones','siigo_terceros','siigo_facturas',
                           'siigo_factura_items','siigo_balance','siigo_cuentas_por_pagar'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon', t);
    -- Solo SELECT. Escribe el proceso de sincronizacion, no la app.
    execute format('grant select on table public.%I to authenticated', t);
    execute format('grant select, insert, update, delete on table public.%I to service_role', t);
    execute format('drop policy if exists %I on public.%I', t||'_select', t);
    execute format('create policy %I on public.%I for select to authenticated
      using (fn_tiene_permiso(''contable'', ''consultar'') or fn_tiene_permiso(''financiero'', ''consultar''))',
      t||'_select', t);
  end loop;
end $$;

do $$
declare v text;
begin
  foreach v in array array['v_siigo_ventas','v_siigo_ventas_por_item','v_siigo_ventas_por_cliente',
                           'v_siigo_iva','v_siigo_terceros_sin_cruzar'] loop
    execute format('revoke all on public.%I from public, anon', v);
    execute format('grant select on public.%I to authenticated', v);
  end loop;
end $$;

-- La configuracion sí la cambia quien manda en Contable (las cuentas de IVA, por ejemplo).
drop policy if exists siigo_config_escribir on public.siigo_config;
create policy siigo_config_escribir on public.siigo_config for update to authenticated
  using (fn_tiene_permiso('contable', 'responsable'))
  with check (fn_tiene_permiso('contable', 'responsable'));
grant update on table public.siigo_config to authenticated;

-- ============================================================ 7) los submódulos
insert into public.modulo_secciones (modulo_id, seccion_id, nombre, href, orden) values
  ('contable','clientes','Clientes','/contable/clientes',1),
  ('contable','proveedores','Proveedores','/contable/proveedores',2),
  ('contable','cuentas-tercero','Cuentas por tercero','/contable/cuentas-tercero',3),
  ('contable','balances','Balances','/contable/balances',4),
  ('contable','iva','IVA','/contable/iva',5),
  ('contable','conciliacion','Conciliación con el ERP','/contable/conciliacion',6),
  ('contable','conexion','Conexión con Siigo','/contable/conexion',7),
  ('financiero','ventas','Ventas','/financiero/ventas',1),
  ('financiero','facturacion','Facturación','/financiero/facturacion',2),
  ('financiero','cuentas-pagar','Cuentas por pagar','/financiero/cuentas-pagar',3),
  ('financiero','rentabilidad','Rentabilidad por proyecto','/financiero/rentabilidad',4)
on conflict (modulo_id, seccion_id) do update
  set nombre = excluded.nombre, href = excluded.href, orden = excluded.orden;
