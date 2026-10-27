-- Migración 83: SG-SST — firman TODOS los técnicos que estuvieron en la obra ese día.
--
-- Hasta la 75, el bloque de firmas de técnicos aceptaba varias firmas pero para cerrar alcanzaba
-- con una. Ahora el formato lleva la lista de los técnicos que estuvieron (nombre y cédula):
--   - Se anota antes de la primera firma y queda sellada con el resto del contenido (entra al hash).
--   - Si la plantilla pide firma de técnico (obligatoria), no se firma nada sin la lista.
--   - Solo firma como técnico alguien de la lista, y una sola vez.
--   - No se cierra hasta que firme cada uno de la lista (la base dice quiénes faltan).
-- Formatos de antes (ya con firmas y sin lista) siguen con la regla de la 75: no se tocan.
-- El hash de los formatos sin lista no cambia (la lista solo entra al hash cuando existe), así que
-- fn_sst_formato_integro sigue dando lo mismo para todo lo ya sellado.

alter table public.sst_formatos add column if not exists tecnicos_en_obra jsonb;

-- Cédula comparable: sin puntos, espacios ni guiones (y en mayúscula, por si es pasaporte).
create or replace function public.fn_sst_doc(p text)
returns text
language sql
immutable
set search_path = public
as $$
  select upper(regexp_replace(coalesce(p, ''), '[^0-9A-Za-z]', '', 'g'));
$$;

-- ¿La plantilla del formato pide firma de técnico obligatoria? (security definer como
-- fn_sst_formato_tiene_firmas: lo usan los triggers sin depender de lo que ve quien firma).
create or replace function public.fn_sst_pide_tecnicos(p_formato_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from sst_formatos f join sst_plantillas p on p.id = f.plantilla_id, jsonb_array_elements(p.firmas) x
    where f.id = p_formato_id and x ->> 'rol' = 'tecnico' and coalesce((x ->> 'obligatoria')::boolean, true));
$$;

create or replace function public.fn_sst_tecnicos_de(p_formato_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select tecnicos_en_obra from sst_formatos where id = p_formato_id and fn_tiene_permiso('sgsst', 'consultar');
$$;

/** Problema con la lista (o null): [{ "nombre": "...", "documento": "..." }], sin cédulas repetidas. */
create or replace function public.fn_sst_tecnicos_problema(p jsonb)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  t jsonb;
  docs text[] := '{}';
  d text;
begin
  if p is null then return null; end if;
  if jsonb_typeof(p) <> 'array' then
    return 'La lista de técnicos en obra tiene que ser una lista.';
  end if;
  for t in select * from jsonb_array_elements(p) loop
    if jsonb_typeof(t) <> 'object' or length(trim(coalesce(t ->> 'nombre', ''))) = 0 then
      return 'Un técnico de la lista no tiene nombre.';
    end if;
    d := fn_sst_doc(t ->> 'documento');
    if d = '' then
      return format('Falta la cédula de %s.', t ->> 'nombre');
    end if;
    if d = any (docs) then
      return format('La cédula de %s está repetida en la lista.', t ->> 'nombre');
    end if;
    docs := docs || d;
  end loop;
  return null;
end;
$$;

-- El hash: igual que en la 75, más la lista SOLO si existe (lo ya sellado da el mismo hash).
create or replace function public.fn_sst_hash_formato(p_formato_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select encode(sha256(convert_to((jsonb_build_object(
    'plantilla', f.plantilla_id,
    'proyecto', f.proyecto_id,
    'cliente', f.cliente_id,
    'lugar', f.lugar,
    'fecha', f.fecha,
    'respuestas', f.respuestas,
    'archivos', coalesce((select jsonb_agg(jsonb_build_array(a.campo_id, a.sha256) order by a.path)
                          from sst_formato_archivos a where a.formato_id = f.id), '[]'::jsonb)
  ) || case when f.tecnicos_en_obra is null then '{}'::jsonb
            else jsonb_build_object('tecnicos_en_obra', f.tecnicos_en_obra) end)::text, 'UTF8')), 'hex')
  from sst_formatos f
  where f.id = p_formato_id
    and (fn_tiene_permiso('sgsst', 'consultar'));
$$;

-- Reglas de la lista en el formato (aparte de las de la 75, que siguen igual).
create or replace function public.fn_sst_tecnicos_formato()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_problema text;
  v_faltan text;
begin
  if current_user in ('postgres', 'supabase_admin') then
    return new;
  end if;
  if tg_op = 'INSERT' or new.tecnicos_en_obra is distinct from old.tecnicos_en_obra then
    if tg_op = 'UPDATE' and (fn_sst_formato_tiene_firmas(old.id) or old.estado <> 'borrador') then
      raise exception 'El formato ya tiene firmas: la lista de técnicos quedó sellada y no se edita.';
    end if;
    v_problema := fn_sst_tecnicos_problema(new.tecnicos_en_obra);
    if v_problema is not null then
      raise exception '%', v_problema;
    end if;
  end if;
  -- Cerrar: cada técnico de la lista firmó.
  if tg_op = 'UPDATE' and old.estado = 'borrador' and new.estado = 'firmado' and old.tecnicos_en_obra is not null then
    select string_agg(t ->> 'nombre', ', ') into v_faltan
    from jsonb_array_elements(old.tecnicos_en_obra) t
    where not exists (select 1 from sst_formato_firmas s
                      where s.formato_id = old.id and s.rol = 'tecnico' and fn_sst_doc(s.documento) = fn_sst_doc(t ->> 'documento'));
    if v_faltan is not null then
      raise exception 'Faltan firmas de técnicos que estuvieron en la obra: %.', v_faltan;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_sst_tecnicos_formato on public.sst_formatos;
create trigger trg_sst_tecnicos_formato
  before insert or update on public.sst_formatos
  for each row execute function public.fn_sst_tecnicos_formato();

-- Reglas de la lista al firmar (aparte de las de la 75).
create or replace function public.fn_sst_tecnicos_firma()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_lista jsonb;
begin
  if current_user in ('postgres', 'supabase_admin') then
    return new;
  end if;
  v_lista := fn_sst_tecnicos_de(new.formato_id);
  -- Formato nuevo (todavía sin firmas): si la plantilla pide técnicos, primero la lista.
  if not fn_sst_formato_tiene_firmas(new.formato_id) and fn_sst_pide_tecnicos(new.formato_id)
     and coalesce(jsonb_array_length(v_lista), 0) = 0 then
    raise exception 'Antes de firmar, anota los técnicos que estuvieron en la obra (nombre y cédula): firman todos.';
  end if;
  if new.rol = 'tecnico' and v_lista is not null then
    if not exists (select 1 from jsonb_array_elements(v_lista) t where fn_sst_doc(t ->> 'documento') = fn_sst_doc(new.documento)) then
      raise exception 'La cédula % no está en la lista de técnicos que estuvieron en la obra.', new.documento;
    end if;
    if exists (select 1 from sst_formato_firmas s where s.formato_id = new.formato_id and s.rol = 'tecnico'
               and fn_sst_doc(s.documento) = fn_sst_doc(new.documento)) then
      raise exception 'Ese técnico ya firmó este formato.';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_sst_tecnicos_firma on public.sst_formato_firmas;
create trigger trg_sst_tecnicos_firma
  before insert on public.sst_formato_firmas
  for each row execute function public.fn_sst_tecnicos_firma();

revoke all on function public.fn_sst_pide_tecnicos(uuid) from public, anon;
revoke all on function public.fn_sst_tecnicos_de(uuid) from public, anon;
grant execute on function public.fn_sst_pide_tecnicos(uuid) to authenticated, service_role;
grant execute on function public.fn_sst_tecnicos_de(uuid) to authenticated, service_role;
