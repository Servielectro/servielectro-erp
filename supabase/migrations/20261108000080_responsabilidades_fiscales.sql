-- Responsabilidades fiscales: dos sistemas de códigos, cada uno en su sitio (2026-10-27).
--
-- Hallazgo con datos reales (cliente NIZA VIII 53): en clientes.responsabilidades_rut conviven dos
-- codificaciones distintas de la DIAN:
--   - RUT, casilla 53 "Responsabilidades, calidades y atributos": códigos numéricos ("07", "42", "55").
--     Los lee la IA del RUT y son los que trae el documento.
--   - Factura electrónica (anexo técnico, cbc:TaxLevelCode): "O-13", "O-15", "O-23", "O-47", "R-99-PN".
--     Son los que pide la factura y los que exporta SIIGO.
-- Las casillas de la ficha guardaban 13, 15, 23, 47 (que en la casilla 53 significan lo mismo) y
-- además "R-99-PN", que NO es un código del RUT. El importador convertía "O-13" en "13".
--
-- Esta migración:
--   1) responsabilidades_fiscales: catálogo (sistema rut|fe, código, nombre, si afecta la facturación,
--      activa, fuente). CARGADO desde las fuentes oficiales de la DIAN (descargadas el 2026-10-27):
--        RUT: DIAN, Instructivo de calidad del RUT IN-CAC-0237 v3 (vigente desde 04/03/2026), casilla 53. 48 códigos.
--        FE:  DIAN, Preguntas y respuestas implementación anexo técnico FE (Res. 042 y anexo 1.7-2020, num. 6.2.7), vigente desde 01/08/2020; ratificado en anexo 1.9 (Res. 165 de 2023). 5 códigos.
--      "afecta_facturacion" es una propuesta inicial para ordenar la pantalla (cuáles van arriba);
--      la gestión la ajusta. Las sugerencias de "responsable de IVA" y "declarante de renta" salen
--      del NOMBRE oficial del código (48 IVA → responsable; 49 y 53 → no responsable; 04 y 05 renta →
--      declarante) y en pantalla son SUGERENCIA, no dato.
--   2) equivalente_fe: la relación entre un código del RUT y uno de factura electrónica. VACÍA a
--      propósito: la confirma el contador (equivocarse cuesta plata).
--   3) clientes.responsabilidades_fe: lo de la factura electrónica, aparte. Se pasa "R-99-PN" de
--      responsabilidades_rut a responsabilidades_fe (único código FE que quedó en la columna del RUT).
--      responsabilidades_rut sigue guardando TODO lo leído del RUT, esté o no en el catálogo.
--   4) fn_importar_clientes acepta responsabilidades_fe (lo de SIIGO va ahí, tal cual: "O-13").
--
-- Verificación: supabase/verificaciones/20261108000080_verificar.sql
-- Rollback:     supabase/rollbacks/20261108000080_responsabilidades_fiscales_down.sql
-- Idempotente.

-- ============================================================ 1) catálogo
create table if not exists public.responsabilidades_fiscales (
  sistema text not null check (sistema in ('rut', 'fe')),
  codigo text not null check (length(trim(codigo)) > 0),
  nombre text not null check (length(trim(nombre)) > 0),
  afecta_facturacion boolean not null default false,
  activa boolean not null default true,
  sugiere_responsable_iva boolean,     -- según el nombre oficial del código; en pantalla, sugerencia
  sugiere_declarante_renta boolean,
  equivalente_fe text,                 -- solo para sistema 'rut': VACÍO hasta que lo confirme el contador
  fuente text,
  actualizado_por uuid references public.perfiles (id),
  actualizado_en timestamptz not null default now(),
  primary key (sistema, codigo),
  check (sistema = 'rut' or equivalente_fe is null),
  check (sistema <> 'rut' or codigo ~ '^[0-9]{2,3}$'),
  check (sistema <> 'fe' or codigo ~ '^[A-Z]-[0-9]{2}(-[A-Z]{2})?$')
);

insert into public.responsabilidades_fiscales (sistema, codigo, nombre, afecta_facturacion, sugiere_responsable_iva, sugiere_declarante_renta, fuente) values
  ('rut', '01', 'Aporte especial para la administración de justicia', false, null, null, 'DIAN, Instructivo de calidad del RUT IN-CAC-0237 v3 (vigente desde 04/03/2026), casilla 53'),
  ('rut', '02', 'Gravamen a los movimientos financieros', false, null, null, 'DIAN, Instructivo de calidad del RUT IN-CAC-0237 v3 (vigente desde 04/03/2026), casilla 53'),
  ('rut', '03', 'Impuesto al patrimonio', false, null, null, 'DIAN, Instructivo de calidad del RUT IN-CAC-0237 v3 (vigente desde 04/03/2026), casilla 53'),
  ('rut', '04', 'Impuesto sobre la renta y complementario régimen tributario especial', false, null, true, 'DIAN, Instructivo de calidad del RUT IN-CAC-0237 v3 (vigente desde 04/03/2026), casilla 53'),
  ('rut', '05', 'Impuesto sobre la renta y complementario régimen ordinario', true, null, true, 'DIAN, Instructivo de calidad del RUT IN-CAC-0237 v3 (vigente desde 04/03/2026), casilla 53'),
  ('rut', '06', 'Declaración de Ingresos y patrimonio', false, null, null, 'DIAN, Instructivo de calidad del RUT IN-CAC-0237 v3 (vigente desde 04/03/2026), casilla 53'),
  ('rut', '07', 'Retención en la fuente a título de renta', true, null, null, 'DIAN, Instructivo de calidad del RUT IN-CAC-0237 v3 (vigente desde 04/03/2026), casilla 53'),
  ('rut', '08', 'Retención Impuesto de timbre nacional', false, null, null, 'DIAN, Instructivo de calidad del RUT IN-CAC-0237 v3 (vigente desde 04/03/2026), casilla 53'),
  ('rut', '09', 'Retención en la fuente en el impuesto sobre las ventas', true, null, null, 'DIAN, Instructivo de calidad del RUT IN-CAC-0237 v3 (vigente desde 04/03/2026), casilla 53'),
  ('rut', '10', 'Obligado aduanero', false, null, null, 'DIAN, Instructivo de calidad del RUT IN-CAC-0237 v3 (vigente desde 04/03/2026), casilla 53'),
  ('rut', '13', 'Gran contribuyente', true, null, null, 'DIAN, Instructivo de calidad del RUT IN-CAC-0237 v3 (vigente desde 04/03/2026), casilla 53'),
  ('rut', '14', 'Informante de Exógena', false, null, null, 'DIAN, Instructivo de calidad del RUT IN-CAC-0237 v3 (vigente desde 04/03/2026), casilla 53'),
  ('rut', '15', 'Autoretenedor', true, null, null, 'DIAN, Instructivo de calidad del RUT IN-CAC-0237 v3 (vigente desde 04/03/2026), casilla 53'),
  ('rut', '16', 'Obligación facturar por ingresos bienes y/o servicios excluidos', false, null, null, 'DIAN, Instructivo de calidad del RUT IN-CAC-0237 v3 (vigente desde 04/03/2026), casilla 53'),
  ('rut', '17', 'Profesionales de compra y venta de divisas', false, null, null, 'DIAN, Instructivo de calidad del RUT IN-CAC-0237 v3 (vigente desde 04/03/2026), casilla 53'),
  ('rut', '18', 'Precios de transferencia', false, null, null, 'DIAN, Instructivo de calidad del RUT IN-CAC-0237 v3 (vigente desde 04/03/2026), casilla 53'),
  ('rut', '19', 'Productor de bienes y/o servicios exentos (incluye exportadores)', false, null, null, 'DIAN, Instructivo de calidad del RUT IN-CAC-0237 v3 (vigente desde 04/03/2026), casilla 53'),
  ('rut', '20', 'Obtención NIT', false, null, null, 'DIAN, Instructivo de calidad del RUT IN-CAC-0237 v3 (vigente desde 04/03/2026), casilla 53'),
  ('rut', '21', 'Declarar ingreso o salida del país de divisas o moneda legal', false, null, null, 'DIAN, Instructivo de calidad del RUT IN-CAC-0237 v3 (vigente desde 04/03/2026), casilla 53'),
  ('rut', '22', 'Obligado a cumplir deberes formales a nombre de terceros', false, null, null, 'DIAN, Instructivo de calidad del RUT IN-CAC-0237 v3 (vigente desde 04/03/2026), casilla 53'),
  ('rut', '23', 'Agente de retención en ventas', true, null, null, 'DIAN, Instructivo de calidad del RUT IN-CAC-0237 v3 (vigente desde 04/03/2026), casilla 53'),
  ('rut', '26', 'Declaración Individual Precios de Transferencia', false, null, null, 'DIAN, Instructivo de calidad del RUT IN-CAC-0237 v3 (vigente desde 04/03/2026), casilla 53'),
  ('rut', '32', 'Impuesto Nacional a la gasolina y al ACPM', false, null, null, 'DIAN, Instructivo de calidad del RUT IN-CAC-0237 v3 (vigente desde 04/03/2026), casilla 53'),
  ('rut', '33', 'Impuesto Nacional al Consumo', false, null, null, 'DIAN, Instructivo de calidad del RUT IN-CAC-0237 v3 (vigente desde 04/03/2026), casilla 53'),
  ('rut', '36', 'Establecimiento Permanente', false, null, null, 'DIAN, Instructivo de calidad del RUT IN-CAC-0237 v3 (vigente desde 04/03/2026), casilla 53'),
  ('rut', '39', 'Proveedor de Servicios Tecnológicos PST', false, null, null, 'DIAN, Instructivo de calidad del RUT IN-CAC-0237 v3 (vigente desde 04/03/2026), casilla 53'),
  ('rut', '41', 'Declaración anual de activos en el exterior', false, null, null, 'DIAN, Instructivo de calidad del RUT IN-CAC-0237 v3 (vigente desde 04/03/2026), casilla 53'),
  ('rut', '42', 'Obligado a llevar contabilidad', true, null, null, 'DIAN, Instructivo de calidad del RUT IN-CAC-0237 v3 (vigente desde 04/03/2026), casilla 53'),
  ('rut', '45', 'Autorretenedor de rendimientos financieros', false, null, null, 'DIAN, Instructivo de calidad del RUT IN-CAC-0237 v3 (vigente desde 04/03/2026), casilla 53'),
  ('rut', '46', 'IVA Prestadores de Servicios desde el Exterior', false, null, null, 'DIAN, Instructivo de calidad del RUT IN-CAC-0237 v3 (vigente desde 04/03/2026), casilla 53'),
  ('rut', '47', 'Régimen Simple de Tributación - SIMPLE', true, null, null, 'DIAN, Instructivo de calidad del RUT IN-CAC-0237 v3 (vigente desde 04/03/2026), casilla 53'),
  ('rut', '48', 'Impuesto sobre las ventas - IVA', true, true, null, 'DIAN, Instructivo de calidad del RUT IN-CAC-0237 v3 (vigente desde 04/03/2026), casilla 53'),
  ('rut', '49', 'No responsable de IVA', true, false, null, 'DIAN, Instructivo de calidad del RUT IN-CAC-0237 v3 (vigente desde 04/03/2026), casilla 53'),
  ('rut', '50', 'No responsable de Consumo restaurantes y bares', false, null, null, 'DIAN, Instructivo de calidad del RUT IN-CAC-0237 v3 (vigente desde 04/03/2026), casilla 53'),
  ('rut', '52', 'Facturador electrónico', true, null, null, 'DIAN, Instructivo de calidad del RUT IN-CAC-0237 v3 (vigente desde 04/03/2026), casilla 53'),
  ('rut', '53', 'Persona Jurídica No Responsable de IVA', true, false, null, 'DIAN, Instructivo de calidad del RUT IN-CAC-0237 v3 (vigente desde 04/03/2026), casilla 53'),
  ('rut', '54', 'Intercambio automático de Información CRS', false, null, null, 'DIAN, Instructivo de calidad del RUT IN-CAC-0237 v3 (vigente desde 04/03/2026), casilla 53'),
  ('rut', '55', 'Informante de Beneficiarios Finales', false, null, null, 'DIAN, Instructivo de calidad del RUT IN-CAC-0237 v3 (vigente desde 04/03/2026), casilla 53'),
  ('rut', '56', 'Impuesto Nacional al Carbono', false, null, null, 'DIAN, Instructivo de calidad del RUT IN-CAC-0237 v3 (vigente desde 04/03/2026), casilla 53'),
  ('rut', '58', 'Intercambio Automático de Información FATCA', false, null, null, 'DIAN, Instructivo de calidad del RUT IN-CAC-0237 v3 (vigente desde 04/03/2026), casilla 53'),
  ('rut', '59', 'Autorretención especial renta', false, null, null, 'DIAN, Instructivo de calidad del RUT IN-CAC-0237 v3 (vigente desde 04/03/2026), casilla 53'),
  ('rut', '60', 'Autorretención por concepto de intereses y rendimientos financieros de entidades vigiladas por la Superintendencia Financiera de Colombia', false, null, null, 'DIAN, Instructivo de calidad del RUT IN-CAC-0237 v3 (vigente desde 04/03/2026), casilla 53'),
  ('rut', '61', 'Autorretención por concepto de comisiones de entidades vigiladas por la Superintendencia Financiera de Colombia', false, null, null, 'DIAN, Instructivo de calidad del RUT IN-CAC-0237 v3 (vigente desde 04/03/2026), casilla 53'),
  ('rut', '62', 'Impuesto nacional sobre productos plásticos de un solo uso utilizados para envasar, embalar o empacar bienes', false, null, null, 'DIAN, Instructivo de calidad del RUT IN-CAC-0237 v3 (vigente desde 04/03/2026), casilla 53'),
  ('rut', '63', 'Impuesto a las bebidas ultraprocesadas azucaradas', false, null, null, 'DIAN, Instructivo de calidad del RUT IN-CAC-0237 v3 (vigente desde 04/03/2026), casilla 53'),
  ('rut', '64', 'Impuesto a los productos comestibles ultraprocesados industrialmente y/o con alto contenido de azúcares añadidos, sodio o grasas saturadas', false, null, null, 'DIAN, Instructivo de calidad del RUT IN-CAC-0237 v3 (vigente desde 04/03/2026), casilla 53'),
  ('rut', '65', 'Renta Presencia económica significativa en Colombia -PES', false, null, null, 'DIAN, Instructivo de calidad del RUT IN-CAC-0237 v3 (vigente desde 04/03/2026), casilla 53'),
  ('rut', '66', 'Intercambio Automático de Información DPI', false, null, null, 'DIAN, Instructivo de calidad del RUT IN-CAC-0237 v3 (vigente desde 04/03/2026), casilla 53'),
  ('fe', 'O-13', 'Gran contribuyente', true, null, null, 'DIAN, Preguntas y respuestas implementación anexo técnico FE (Res. 042 y anexo 1.7-2020, num. 6.2.7), vigente desde 01/08/2020; ratificado en anexo 1.9 (Res. 165 de 2023)'),
  ('fe', 'O-15', 'Autorretenedor', true, null, null, 'DIAN, Preguntas y respuestas implementación anexo técnico FE (Res. 042 y anexo 1.7-2020, num. 6.2.7), vigente desde 01/08/2020; ratificado en anexo 1.9 (Res. 165 de 2023)'),
  ('fe', 'O-23', 'Agente de retención IVA', true, null, null, 'DIAN, Preguntas y respuestas implementación anexo técnico FE (Res. 042 y anexo 1.7-2020, num. 6.2.7), vigente desde 01/08/2020; ratificado en anexo 1.9 (Res. 165 de 2023)'),
  ('fe', 'O-47', 'Régimen simple de tributación', true, null, null, 'DIAN, Preguntas y respuestas implementación anexo técnico FE (Res. 042 y anexo 1.7-2020, num. 6.2.7), vigente desde 01/08/2020; ratificado en anexo 1.9 (Res. 165 de 2023)'),
  ('fe', 'R-99-PN', 'No responsable', true, null, null, 'DIAN, Preguntas y respuestas implementación anexo técnico FE (Res. 042 y anexo 1.7-2020, num. 6.2.7), vigente desde 01/08/2020; ratificado en anexo 1.9 (Res. 165 de 2023)')
on conflict (sistema, codigo) do update set nombre = excluded.nombre, fuente = excluded.fuente;
-- (Al volver a correrla no pisa lo que la gestión haya ajustado: afecta_facturacion, activa,
--  sugerencias y equivalencias se conservan.)

create or replace function public.fn_responsabilidades_quien()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if current_user in ('postgres', 'supabase_admin') then return old; end if;
    raise exception 'Un código del catálogo no se borra: se desactiva.';
  end if;
  if current_user not in ('postgres', 'supabase_admin') then
    new.actualizado_por := auth.uid();
    new.actualizado_en := now();
    if tg_op = 'UPDATE' and (new.sistema, new.codigo) is distinct from (old.sistema, old.codigo) then
      raise exception 'El código y el sistema no se cambian: crea otro y desactiva este.';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_responsabilidades_quien on public.responsabilidades_fiscales;
create trigger trg_responsabilidades_quien
  before insert or update or delete on public.responsabilidades_fiscales
  for each row execute function public.fn_responsabilidades_quien();

-- ============================================================ 2) clientes: FE aparte
alter table public.clientes add column if not exists responsabilidades_fe text[];
alter table public.clientes drop constraint if exists clientes_responsabilidades_fe;
alter table public.clientes add constraint clientes_responsabilidades_fe
  check (responsabilidades_fe is null or array_to_string(responsabilidades_fe, ',') ~ '^([A-Z]-[0-9]{2}(-[A-Z]{2})?)(,[A-Z]-[0-9]{2}(-[A-Z]{2})?)*$');

-- "R-99-PN" no es del RUT: se pasa a la columna de factura electrónica (lo demás se queda donde está).
update public.clientes
set responsabilidades_fe = (select array_agg(distinct x) from unnest(coalesce(responsabilidades_fe, '{}') || array['R-99-PN']) x),
    responsabilidades_rut = nullif(array_remove(responsabilidades_rut, 'R-99-PN'), '{}')
where 'R-99-PN' = any (responsabilidades_rut);

-- ============================================================ 3) importación de SIIGO con FE
create or replace function public.fn_importar_clientes(p_filas jsonb, p_archivo text, p_mapeo jsonb)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_campos text[] := array['nombre', 'nit', 'dv', 'tipo_documento', 'tipo_persona', 'email', 'email_encargado_proyecto',
    'contacto', 'telefono', 'direccion', 'municipio', 'departamento', 'municipio_dane', 'tipo_contribuyente',
    'responsable_iva', 'responsabilidades_rut', 'responsabilidades_fe', 'declarante_renta', 'notas'];
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
        direccion, municipio, departamento, municipio_dane, tipo_contribuyente, responsable_iva, responsabilidades_rut, responsabilidades_fe,
        declarante_renta, notas, actualizado_desde_siigo_en)
      values (
        v_valores ->> 'nombre', v_valores ->> 'nit', v_valores ->> 'dv', v_valores ->> 'tipo_documento', v_valores ->> 'tipo_persona',
        v_valores ->> 'email', v_valores ->> 'email_encargado_proyecto', v_valores ->> 'contacto', v_valores ->> 'telefono',
        v_valores ->> 'direccion', v_valores ->> 'municipio', v_valores ->> 'departamento', v_valores ->> 'municipio_dane',
        v_valores ->> 'tipo_contribuyente', (v_valores ->> 'responsable_iva')::boolean,
        case when v_valores ? 'responsabilidades_rut' then array(select jsonb_array_elements_text(v_valores -> 'responsabilidades_rut')) end,
        case when v_valores ? 'responsabilidades_fe' then array(select jsonb_array_elements_text(v_valores -> 'responsabilidades_fe')) end,
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
        responsabilidades_fe = case when v_valores ? 'responsabilidades_fe'
                                    then array(select jsonb_array_elements_text(v_valores -> 'responsabilidades_fe'))
                                    else responsabilidades_fe end,
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

revoke all on function public.fn_importar_clientes(jsonb, text, jsonb) from public, anon;
grant execute on function public.fn_importar_clientes(jsonb, text, jsonb) to authenticated, service_role;

-- ============================================================ 4) RLS
alter table public.responsabilidades_fiscales enable row level security;
revoke all on table public.responsabilidades_fiscales from anon;
drop policy if exists responsabilidades_select on public.responsabilidades_fiscales;
create policy responsabilidades_select on public.responsabilidades_fiscales for select to authenticated using (true);
-- Ajustar (afecta la facturación, activa, equivalencia con FE, sugerencias) o agregar un código que
-- la DIAN cree: quien responde por los maestros (Administrativo "responsable").
drop policy if exists responsabilidades_insert on public.responsabilidades_fiscales;
create policy responsabilidades_insert on public.responsabilidades_fiscales for insert to authenticated with check (fn_tiene_permiso('administrativo', 'responsable'));
drop policy if exists responsabilidades_update on public.responsabilidades_fiscales;
create policy responsabilidades_update on public.responsabilidades_fiscales for update to authenticated
  using (fn_tiene_permiso('administrativo', 'responsable')) with check (fn_tiene_permiso('administrativo', 'responsable'));
revoke all on function public.fn_responsabilidades_quien() from public, anon, authenticated;
