-- Rollback de la migración 80. Quita el catálogo de responsabilidades y la columna de factura
-- electrónica. OJO: lo importado de SIIGO en responsabilidades_fe se pierde, salvo "R-99-PN", que
-- vuelve a la columna del RUT como estaba antes. Vuelve fn_importar_clientes de la 70.
update public.clientes
set responsabilidades_rut = (select array_agg(distinct x) from unnest(coalesce(responsabilidades_rut, '{}') || array['R-99-PN']) x)
where 'R-99-PN' = any (responsabilidades_fe);
alter table public.clientes drop constraint if exists clientes_responsabilidades_fe;
alter table public.clientes drop column if exists responsabilidades_fe;

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

revoke all on function public.fn_importar_clientes(jsonb, text, jsonb) from public, anon;
grant execute on function public.fn_importar_clientes(jsonb, text, jsonb) to authenticated, service_role;

drop table if exists public.responsabilidades_fiscales;
drop function if exists public.fn_responsabilidades_quien();
