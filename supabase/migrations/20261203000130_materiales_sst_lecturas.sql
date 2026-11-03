-- Material de capacitación SG-SST: la sección /sgsst/materiales y el acuse de lectura del FOR-02.
--
-- Las tablas son de la 20261103120000 (sst_materiales, sst_plantilla_materiales,
-- sst_material_lecturas). Esta migración agrega lo que faltaba para usarlas desde la app:
--   1) la sección "materiales" del menú (orden 13);
--   2) quién ve y quién sube material (la 120000 solo dejaba ver lo publicado);
--   3) registrar y publicar un material en un solo paso (versión siguiente, y la publicada
--      anterior del mismo código queda archivada, porque solo puede haber una);
--   4) el acuse de lectura con la hora de la BASE: abrir y cerrar pasan por funciones, el
--      celular no escribe abierto_en, cerrado_en ni segundos. Es la evidencia de que la
--      inducción se dio y no solo se firmó;
--   5) Storage: materiales/{codigo}/v{n}.pdf en el bucket sgsst.
--
-- No toca funciones existentes (fn_sst_archivo_subible, fn_sst_archivo_visible, fn_sst_faltantes):
-- las políticas de Storage nuevas se SUMAN a las que hay (las permisivas se combinan con OR).

-- ============================================================ 1) la sección del menú
insert into public.modulo_secciones (modulo_id, seccion_id, nombre, href, orden)
values ('sgsst', 'materiales', 'Materiales de capacitación', '/sgsst/materiales', 13)
on conflict (modulo_id, seccion_id) do nothing;

-- ============================================================ 2) ver los materiales
-- La 120000 deja ver lo publicado a quien tiene Capacitaciones. Quien tiene Materiales ve
-- también los borradores y los archivados (el historial de versiones).
drop policy if exists sst_materiales_gestion on public.sst_materiales;
create policy sst_materiales_gestion on public.sst_materiales
  for select to authenticated
  using (public.fn_permiso_seccion('sgsst', 'materiales') is not null);

-- Las lecturas también las ve quien gestiona los materiales.
drop policy if exists sst_material_lecturas_gestion on public.sst_material_lecturas;
create policy sst_material_lecturas_gestion on public.sst_material_lecturas
  for select to authenticated
  using (public.fn_permiso_seccion('sgsst', 'materiales') is not null);

-- ============================================================ 3) registrar y publicar
-- El archivo ya tiene que estar en Storage (materiales/{codigo}/v{version}.{ext}) y pesar lo
-- que dice. La versión la pone la base: la siguiente del código.
create or replace function public.fn_sst_material_registrar(
  p_codigo text,
  p_nombre text,
  p_descripcion text,
  p_path text,
  p_nombre_archivo text,
  p_mime text,
  p_bytes bigint,
  p_sha256 text,
  p_minutos_lectura integer,
  p_publicar boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_codigo text := upper(trim(coalesce(p_codigo, '')));
  v_version integer;
  v_bytes bigint;
  v_id uuid;
  v_hoy date := (now() at time zone 'America/Bogota')::date;
begin
  if coalesce(public.fn_permiso_seccion('sgsst', 'materiales') >= 'trabajar', false) is not true then
    raise exception 'No tiene permiso para subir material de capacitación.';
  end if;
  if v_codigo !~ '^[A-Z0-9][A-Z0-9_-]{0,39}$' then
    raise exception 'El código solo lleva letras, números, guion y guion bajo (ej. IND-SGSST).';
  end if;
  if length(trim(coalesce(p_nombre, ''))) = 0 then
    raise exception 'Falta el nombre del material.';
  end if;
  if p_minutos_lectura is not null and p_minutos_lectura <= 0 then
    raise exception 'Los minutos de lectura tienen que ser más de cero.';
  end if;

  -- Una versión a la vez por código (dos personas subiendo el mismo código).
  perform pg_advisory_xact_lock(hashtext('sst_materiales:' || v_codigo));
  select coalesce(max(version), 0) + 1 into v_version from sst_materiales where codigo = v_codigo;

  if p_path is distinct from 'materiales/' || v_codigo || '/v' || v_version || '.' || lower(regexp_replace(coalesce(p_nombre_archivo, ''), '^.*\.', '')) then
    raise exception 'La ruta del archivo no corresponde: se esperaba materiales/%/v%.<extensión>.', v_codigo, v_version;
  end if;

  select (o.metadata ->> 'size')::bigint into v_bytes
  from storage.objects o where o.bucket_id = 'sgsst' and o.name = p_path;
  if v_bytes is null then
    raise exception 'No está el archivo en Storage (sgsst/%). Súbalo otra vez.', p_path;
  end if;
  if p_bytes is not null and v_bytes <> p_bytes then
    raise exception 'El archivo subido pesa % bytes y se esperaban %: no es el mismo archivo.', v_bytes, p_bytes;
  end if;

  if p_publicar then
    update sst_materiales
       set estado = 'archivado', archivado_en = now(), archivado_por = auth.uid(),
           motivo_archivo = 'Reemplazado por la versión ' || v_version
     where codigo = v_codigo and estado = 'publicado';
  end if;

  insert into sst_materiales
    (codigo, nombre, version, descripcion, path, nombre_archivo, mime, bytes, sha256, minutos_lectura, estado, vigente_desde)
  values
    (v_codigo, trim(p_nombre), v_version, nullif(trim(coalesce(p_descripcion, '')), ''), p_path, p_nombre_archivo, p_mime,
     v_bytes, lower(p_sha256), p_minutos_lectura,
     case when p_publicar then 'publicado' else 'borrador' end,
     case when p_publicar then v_hoy end)
  returning id into v_id;
  return v_id;
end;
$$;

-- Publicar un borrador (la publicada anterior del código queda archivada) o archivar uno.
create or replace function public.fn_sst_material_estado(p_id uuid, p_estado text, p_motivo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  m sst_materiales;
begin
  if coalesce(public.fn_permiso_seccion('sgsst', 'materiales') >= 'trabajar', false) is not true then
    raise exception 'No tiene permiso para cambiar material de capacitación.';
  end if;
  select * into m from sst_materiales where id = p_id for update;
  if m.id is null then
    raise exception 'No existe ese material.';
  end if;
  if p_estado = 'publicado' then
    if m.estado <> 'borrador' then
      raise exception 'Solo se publica un borrador (este está %).', m.estado;
    end if;
    update sst_materiales
       set estado = 'archivado', archivado_en = now(), archivado_por = auth.uid(),
           motivo_archivo = 'Reemplazado por la versión ' || m.version
     where codigo = m.codigo and estado = 'publicado';
    update sst_materiales
       set estado = 'publicado', vigente_desde = (now() at time zone 'America/Bogota')::date
     where id = p_id;
  elsif p_estado = 'archivado' then
    if m.estado = 'archivado' then
      return;
    end if;
    if length(trim(coalesce(p_motivo, ''))) = 0 then
      raise exception 'Diga por qué se archiva.';
    end if;
    update sst_materiales
       set estado = 'archivado', archivado_en = now(), archivado_por = auth.uid(), motivo_archivo = trim(p_motivo)
     where id = p_id;
  else
    raise exception 'Estado no válido: %.', p_estado;
  end if;
end;
$$;

-- ============================================================ 4) acuse de lectura
-- Abrir: con la hora de la base. El material tiene que estar publicado y, si va con un
-- formato, ese formato abierto (borrador).
create or replace function public.fn_sst_material_abrir(
  p_material uuid,
  p_formato uuid,
  p_persona text,
  p_documento text,
  p_dispositivo text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if coalesce(public.fn_permiso_seccion('sgsst', 'capacitaciones') >= 'trabajar', false) is not true then
    raise exception 'No tiene permiso para registrar lecturas de capacitación.';
  end if;
  if not exists (select 1 from sst_materiales where id = p_material and estado = 'publicado') then
    raise exception 'Ese material no está publicado.';
  end if;
  if p_formato is not null and not exists (select 1 from sst_formatos where id = p_formato and estado = 'borrador') then
    raise exception 'La capacitación ya está cerrada.';
  end if;
  if length(trim(coalesce(p_persona, ''))) = 0 or length(trim(coalesce(p_documento, ''))) = 0 then
    raise exception 'Falta el nombre o la cédula de quien lee.';
  end if;
  insert into sst_material_lecturas (material_id, formato_id, persona, documento, dispositivo, leido_por)
  values (p_material, p_formato, trim(p_persona), trim(p_documento), nullif(left(trim(coalesce(p_dispositivo, '')), 200), ''), auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

-- Cerrar: una sola vez, por quien la abrió; los segundos los calcula la base.
create or replace function public.fn_sst_material_cerrar(p_lectura uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_segundos integer;
begin
  update sst_material_lecturas
     set cerrado_en = now(),
         segundos = greatest(0, floor(extract(epoch from (now() - abierto_en))))::integer
   where id = p_lectura and leido_por = auth.uid() and cerrado_en is null
  returning segundos into v_segundos;
  return v_segundos;
end;
$$;

-- El celular ya no escribe la tabla directo: solo por las dos funciones de arriba.
revoke insert, update on public.sst_material_lecturas from authenticated;

-- ============================================================ 5) Storage: materiales/{codigo}/v{n}.ext
drop policy if exists sgsst_materiales_insert on storage.objects;
create policy sgsst_materiales_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'sgsst'
    and (storage.foldername(name))[1] = 'materiales'
    and coalesce(public.fn_permiso_seccion('sgsst', 'materiales') >= 'trabajar', false)
  );
-- Sin reemplazar ni borrar: una versión nueva es un archivo nuevo.

drop policy if exists sgsst_materiales_select on storage.objects;
create policy sgsst_materiales_select on storage.objects for select to authenticated
  using (
    bucket_id = 'sgsst'
    and (storage.foldername(name))[1] = 'materiales'
    and (public.fn_permiso_seccion('sgsst', 'capacitaciones') is not null
         or public.fn_permiso_seccion('sgsst', 'materiales') is not null)
  );

-- ============================================================ 6) privilegios
revoke all on function public.fn_sst_material_registrar(text, text, text, text, text, text, bigint, text, integer, boolean) from public, anon;
revoke all on function public.fn_sst_material_estado(uuid, text, text) from public, anon;
revoke all on function public.fn_sst_material_abrir(uuid, uuid, text, text, text) from public, anon;
revoke all on function public.fn_sst_material_cerrar(uuid) from public, anon;
grant execute on function public.fn_sst_material_registrar(text, text, text, text, text, text, bigint, text, integer, boolean) to authenticated;
grant execute on function public.fn_sst_material_estado(uuid, text, text) to authenticated;
grant execute on function public.fn_sst_material_abrir(uuid, uuid, text, text, text) to authenticated;
grant execute on function public.fn_sst_material_cerrar(uuid) to authenticated;
