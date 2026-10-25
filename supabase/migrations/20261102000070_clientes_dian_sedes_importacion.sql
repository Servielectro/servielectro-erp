-- Módulo Clientes (2026-11-02): los datos fiscales que trae SIIGO, las sedes de cada cliente y la
-- importación del Excel de SIIGO (docs/nexgo-crm-y-clientes.md).
--
-- 1) clientes: tipo de documento DIAN, tipo de persona, DV separado del NIT, código DANE del
--    municipio, declarante de renta, correo del encargado de proyecto y notas. responsabilidades_rut
--    ya existe (40) y se sigue usando con los mismos códigos (O-13, O-15, O-23, O-47, R-99-PN).
-- 2) Regla del NIT en la base, no en la pantalla: con tipo de documento 31 (NIT), si el DV viene
--    pegado ("900123456-7") se separa; si no viene, se calcula (algoritmo de la DIAN); si viene y
--    no corresponde, se rechaza.
-- 3) cliente_sedes: un cliente con varias sedes (Jhojan lo pidió hace tiempo), cada una con su
--    dirección, contacto y ubicación tomada en sitio.
-- 4) Importación de SIIGO: fn_importar_clientes recibe las filas YA mapeadas y revisadas en
--    pantalla (subir → confirmar qué columna va a qué campo → vista previa → importar). Reglas que
--    no se negocian, en la base:
--      - cruza por NIT (fn_nit_base, la misma de la 31); si existe, actualiza; si no, crea.
--      - actualizar NUNCA borra lo que el ERP tiene y SIIGO no: solo escribe los campos que traen
--        valor, y nunca toca la ubicación GPS ni las sedes (no son campos importables).
--      - queda registro de cada importación (quién, cuándo, archivo, mapeo, cuántos).
--    El mapeo concreto lo define Jhojan con un archivo de ejemplo; la base solo acepta la lista
--    fija de campos de abajo.
--
-- Dónde vive: en ADMINISTRATIVO (decisión del 2026-10-25). Clientes, sedes y proveedores son los
-- maestros ("quién es y cómo lo contacto"); Financiero es la plata ("cuánto me debe"). Así alguien
-- puede mantener clientes —corregir un NIT, agregar una sede, subir el Excel de SIIGO— sin ver
-- cartera ni márgenes. Permisos:
--   clientes y sedes: leer = Comercial o Administrativo "consultar"; crear y editar = Comercial o
--     Administrativo "trabajar" (Comercial sigue creando el cliente desde la cotización);
--     borrar clientes = "responsable" de cualquiera de los dos. Las sedes no se borran.
--   importar de SIIGO y su registro: solo Administrativo ("trabajar" importa, "consultar" ve).
-- El rol Administrador recibe Administrativo "responsable" solo si no lo tiene; a los demás roles
-- no se les cambia nada.
--
-- Verificación: supabase/verificaciones/20261102000070_verificar.sql
-- Rollback:     supabase/rollbacks/20261102000070_clientes_dian_sedes_importacion_down.sql
-- Idempotente.

-- ============================================================ 1) columnas
alter table public.clientes add column if not exists tipo_documento text;
alter table public.clientes drop constraint if exists clientes_tipo_documento;
-- Tabla de tipos de documento de la DIAN (facturación electrónica).
alter table public.clientes add constraint clientes_tipo_documento
  check (tipo_documento is null or tipo_documento in ('11', '12', '13', '21', '22', '31', '41', '42', '47', '48', '50', '91'));
alter table public.clientes add column if not exists tipo_persona text;
alter table public.clientes drop constraint if exists clientes_tipo_persona;
alter table public.clientes add constraint clientes_tipo_persona check (tipo_persona is null or tipo_persona in ('natural', 'juridica'));
alter table public.clientes add column if not exists dv text;
alter table public.clientes drop constraint if exists clientes_dv;
alter table public.clientes add constraint clientes_dv check (dv is null or dv ~ '^[0-9]$');
alter table public.clientes add column if not exists municipio_dane text;
alter table public.clientes drop constraint if exists clientes_municipio_dane;
alter table public.clientes add constraint clientes_municipio_dane check (municipio_dane is null or municipio_dane ~ '^[0-9]{5}$');
alter table public.clientes add column if not exists declarante_renta boolean;
alter table public.clientes add column if not exists email_encargado_proyecto text;
alter table public.clientes add column if not exists notas text;
alter table public.clientes add column if not exists actualizado_desde_siigo_en timestamptz;

-- ============================================================ 2) el NIT y su DV
-- Dígito de verificación del NIT (algoritmo de la DIAN: pesos 3, 7, 13, 17, 19, 23, 29, 37, 41,
-- 43, 47, 53, 59, 67, 71 sobre los dígitos de derecha a izquierda; residuo módulo 11).
create or replace function public.fn_dv_nit(p_nit text)
returns text
language plpgsql
immutable
as $$
declare
  v text := fn_nit_base(p_nit);
  pesos int[] := array[3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];
  suma int := 0;
  i int;
  r int;
begin
  if v is null or length(v) > 15 then
    return null;
  end if;
  for i in 1..length(v) loop
    suma := suma + substr(v, length(v) - i + 1, 1)::int * pesos[i];
  end loop;
  r := suma % 11;
  return (case when r in (0, 1) then r else 11 - r end)::text;
end;
$$;

create or replace function public.fn_clientes_nit()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_pegado text;
begin
  if new.tipo_documento = '31' and new.nit is not null then
    -- "900123456-7": el DV se separa y el NIT queda sin él.
    v_pegado := nullif(regexp_replace(split_part(new.nit, '-', 2), '[^0-9]', '', 'g'), '');
    if new.dv is null and v_pegado is not null and length(v_pegado) = 1 then
      new.dv := v_pegado;
    end if;
    new.nit := fn_nit_base(new.nit);
    if new.dv is null then
      new.dv := fn_dv_nit(new.nit);
    elsif new.dv is distinct from fn_dv_nit(new.nit) then
      raise exception 'El DV % no corresponde al NIT % (debería ser %). Revise el NIT o el DV.', new.dv, new.nit, fn_dv_nit(new.nit);
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_clientes_nit on public.clientes;
create trigger trg_clientes_nit
  before insert or update of nit, dv, tipo_documento on public.clientes
  for each row execute function public.fn_clientes_nit();

-- ============================================================ 3) sedes
create table if not exists public.cliente_sedes (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes (id) on delete restrict,
  nombre text not null check (length(trim(nombre)) > 0),        -- "Sede norte", "Torre 2"…
  direccion text,
  municipio text,
  municipio_dane text check (municipio_dane is null or municipio_dane ~ '^[0-9]{5}$'),
  contacto text,
  telefono text,
  email text,
  latitud numeric(9,6) check (latitud is null or latitud between -90 and 90),
  longitud numeric(9,6) check (longitud is null or longitud between -180 and 180),
  ubicacion_precision_m numeric(8,1),
  ubicacion_tomada_en timestamptz,
  notas text,
  activa boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_cliente_sedes on public.cliente_sedes (cliente_id, nombre);
drop trigger if exists trg_cliente_sedes_updated_at on public.cliente_sedes;
create trigger trg_cliente_sedes_updated_at
  before update on public.cliente_sedes
  for each row execute function extensions.moddatetime(updated_at);

-- ============================================================ 4) importación de SIIGO
create table if not exists public.importaciones_clientes (
  id uuid primary key default gen_random_uuid(),
  archivo_nombre text,
  mapeo jsonb not null default '{}'::jsonb,       -- columna del Excel → campo del ERP, como se confirmó
  filas int not null default 0,
  creados int not null default 0,
  actualizados int not null default 0,
  importado_por uuid not null default auth.uid() references public.perfiles (id),
  importado_en timestamptz not null default now()
);

-- Filas: [{ "nit": "...", "nombre": "...", ... }] con SOLO los campos importables. Un campo
-- ausente o vacío no cambia nada en un cliente existente. Invoker: además de esta revisión, la RLS
-- de clientes vuelve a exigir permiso para crear y actualizar.
create or replace function public.fn_importar_clientes(p_filas jsonb, p_archivo text, p_mapeo jsonb)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_campos text[] := array['nombre', 'nit', 'dv', 'tipo_documento', 'tipo_persona', 'email', 'email_encargado_proyecto',
    'contacto', 'telefono', 'direccion', 'municipio', 'departamento', 'municipio_dane', 'tipo_contribuyente',
    'responsable_iva', 'responsabilidades_rut', 'declarante_renta', 'notas'];
  f jsonb;
  k text;
  v_id uuid;
  v_nit text;
  v_valores jsonb;
  v_trae boolean;
  v_creados int := 0;
  v_actualizados int := 0;
  v_n int := 0;
begin
  if not fn_tiene_permiso('administrativo', 'trabajar') then
    raise exception 'Importar clientes requiere Administrativo en nivel "trabajar".';
  end if;
  if jsonb_typeof(p_filas) is distinct from 'array' then
    raise exception 'Las filas tienen que venir como una lista.';
  end if;

  for f in select * from jsonb_array_elements(p_filas) loop
    v_n := v_n + 1;
    -- Solo los campos importables y con valor (nunca la ubicación, nunca vacíos).
    if jsonb_typeof(f) is distinct from 'object' then
      raise exception 'Fila %: no tiene el formato de un cliente.', v_n;
    end if;
    v_valores := '{}'::jsonb;
    for k in select jsonb_object_keys(f) loop
      if not (k = any (v_campos)) then
        raise exception 'Fila %: "%" no es un campo importable.', v_n, k;
      end if;
      v_trae := case jsonb_typeof(f -> k)
                  when 'string' then nullif(trim(f ->> k), '') is not null
                  when 'array' then jsonb_array_length(f -> k) > 0
                  when 'boolean' then true
                  when 'number' then true
                  else false
                end;
      if v_trae then
        v_valores := v_valores || jsonb_build_object(k, case when jsonb_typeof(f -> k) = 'string' then to_jsonb(trim(f ->> k)) else f -> k end);
      end if;
    end loop;

    v_nit := fn_nit_base(v_valores ->> 'nit');
    v_id := null;
    if v_nit is not null then
      select id into v_id from clientes where fn_nit_base(nit) = v_nit limit 1;
    end if;

    if v_id is null then
      if v_valores ->> 'nombre' is null then
        raise exception 'Fila %: un cliente nuevo necesita nombre.', v_n;
      end if;
      insert into clientes (nombre, nit, dv, tipo_documento, tipo_persona, email, email_encargado_proyecto, contacto, telefono,
        direccion, municipio, departamento, municipio_dane, tipo_contribuyente, responsable_iva, responsabilidades_rut,
        declarante_renta, notas, actualizado_desde_siigo_en)
      values (
        v_valores ->> 'nombre', v_valores ->> 'nit', v_valores ->> 'dv', v_valores ->> 'tipo_documento', v_valores ->> 'tipo_persona',
        v_valores ->> 'email', v_valores ->> 'email_encargado_proyecto', v_valores ->> 'contacto', v_valores ->> 'telefono',
        v_valores ->> 'direccion', v_valores ->> 'municipio', v_valores ->> 'departamento', v_valores ->> 'municipio_dane',
        v_valores ->> 'tipo_contribuyente', (v_valores ->> 'responsable_iva')::boolean,
        case when v_valores ? 'responsabilidades_rut' then array(select jsonb_array_elements_text(v_valores -> 'responsabilidades_rut')) end,
        (v_valores ->> 'declarante_renta')::boolean, v_valores ->> 'notas', now());
      v_creados := v_creados + 1;
    else
      -- Cada campo: el de SIIGO si trae valor; si no, el que ya estaba. La ubicación y las sedes no se tocan.
      update clientes set
        -- El NIT no se reescribe: es por donde se encontró.
        nombre = coalesce(v_valores ->> 'nombre', nombre),
        dv = coalesce(v_valores ->> 'dv', dv),
        tipo_documento = coalesce(v_valores ->> 'tipo_documento', tipo_documento),
        tipo_persona = coalesce(v_valores ->> 'tipo_persona', tipo_persona),
        email = coalesce(v_valores ->> 'email', email),
        email_encargado_proyecto = coalesce(v_valores ->> 'email_encargado_proyecto', email_encargado_proyecto),
        contacto = coalesce(v_valores ->> 'contacto', contacto),
        telefono = coalesce(v_valores ->> 'telefono', telefono),
        direccion = coalesce(v_valores ->> 'direccion', direccion),
        municipio = coalesce(v_valores ->> 'municipio', municipio),
        departamento = coalesce(v_valores ->> 'departamento', departamento),
        municipio_dane = coalesce(v_valores ->> 'municipio_dane', municipio_dane),
        tipo_contribuyente = coalesce(v_valores ->> 'tipo_contribuyente', tipo_contribuyente),
        responsable_iva = coalesce((v_valores ->> 'responsable_iva')::boolean, responsable_iva),
        responsabilidades_rut = case when v_valores ? 'responsabilidades_rut'
                                     then array(select jsonb_array_elements_text(v_valores -> 'responsabilidades_rut'))
                                     else responsabilidades_rut end,
        declarante_renta = coalesce((v_valores ->> 'declarante_renta')::boolean, declarante_renta),
        notas = coalesce(v_valores ->> 'notas', notas),
        actualizado_desde_siigo_en = now()
      where id = v_id;
      v_actualizados := v_actualizados + 1;
    end if;
  end loop;

  insert into importaciones_clientes (archivo_nombre, mapeo, filas, creados, actualizados)
  values (nullif(trim(p_archivo), ''), coalesce(p_mapeo, '{}'::jsonb), v_n, v_creados, v_actualizados);

  return jsonb_build_object('filas', v_n, 'creados', v_creados, 'actualizados', v_actualizados);
end;
$$;

-- ============================================================ 5) permisos: Administrativo
insert into public.permisos_rol (rol_id, modulo_id, nivel, ve_datos_sensibles)
select r.id, 'administrativo', 'responsable', true
from public.roles r
where r.nombre = 'Administrador'
on conflict (rol_id, modulo_id) do nothing;

-- Comercial o Administrativo, al nivel pedido.
create or replace function public.fn_clientes_permiso(p_nivel nivel_permiso)
returns boolean
language sql
stable
set search_path = public
as $$
  select fn_tiene_permiso('comercial', p_nivel) or fn_tiene_permiso('administrativo', p_nivel)
$$;

-- clientes: las políticas de la 38 (solo Comercial) pasan a Comercial o Administrativo.
drop policy if exists clientes_select on public.clientes;
create policy clientes_select on public.clientes for select to authenticated using (fn_clientes_permiso('consultar'));
drop policy if exists clientes_insert on public.clientes;
create policy clientes_insert on public.clientes for insert to authenticated with check (fn_clientes_permiso('trabajar'));
drop policy if exists clientes_update on public.clientes;
create policy clientes_update on public.clientes for update to authenticated
  using (fn_clientes_permiso('trabajar')) with check (fn_clientes_permiso('trabajar'));
drop policy if exists clientes_delete on public.clientes;
create policy clientes_delete on public.clientes for delete to authenticated using (fn_clientes_permiso('responsable'));

alter table public.cliente_sedes enable row level security;
revoke all on table public.cliente_sedes from anon;
drop policy if exists cliente_sedes_select on public.cliente_sedes;
create policy cliente_sedes_select on public.cliente_sedes for select to authenticated using (fn_clientes_permiso('consultar'));
drop policy if exists cliente_sedes_insert on public.cliente_sedes;
create policy cliente_sedes_insert on public.cliente_sedes for insert to authenticated with check (fn_clientes_permiso('trabajar'));
drop policy if exists cliente_sedes_update on public.cliente_sedes;
create policy cliente_sedes_update on public.cliente_sedes for update to authenticated
  using (fn_clientes_permiso('trabajar')) with check (fn_clientes_permiso('trabajar'));
-- Sin delete: una sede se desactiva.

alter table public.importaciones_clientes enable row level security;
revoke all on table public.importaciones_clientes from anon;
drop policy if exists importaciones_clientes_select on public.importaciones_clientes;
create policy importaciones_clientes_select on public.importaciones_clientes for select to authenticated
  using (fn_tiene_permiso('administrativo', 'consultar'));
drop policy if exists importaciones_clientes_insert on public.importaciones_clientes;
create policy importaciones_clientes_insert on public.importaciones_clientes for insert to authenticated
  with check (fn_tiene_permiso('administrativo', 'trabajar') and importado_por = auth.uid());
-- Sin update ni delete: el registro de importaciones no se cambia ni se borra.

-- ============================================================ 6) privilegios
revoke all on function public.fn_importar_clientes(jsonb, text, jsonb) from public, anon;
grant execute on function public.fn_importar_clientes(jsonb, text, jsonb) to authenticated, service_role;
revoke all on function public.fn_dv_nit(text) from public, anon;
grant execute on function public.fn_dv_nit(text) to authenticated, service_role;
revoke all on function public.fn_clientes_nit() from public, anon, authenticated;
revoke all on function public.fn_clientes_permiso(nivel_permiso) from public, anon;
grant execute on function public.fn_clientes_permiso(nivel_permiso) to authenticated, service_role;
