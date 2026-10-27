-- Rollback de la migración 85: el motor de plantillas vuelve a ser solo de SG-SST.
-- Se NIEGA si ya hay plantillas o actas de Proyectos: quitar el ámbito las dejaría a la vista de
-- SG-SST (y sin dueño). En ese caso, primero se decide qué hacer con ellas.
do $$
begin
  if exists (select 1 from public.sst_plantillas where ambito <> 'sgsst') or exists (select 1 from public.sst_formatos where ambito <> 'sgsst') then
    raise exception 'Hay plantillas o actas de Proyectos: el rollback de la 85 no se corre sin decidir qué pasa con ellas.';
  end if;
end $$;

-- Políticas de la 75 (las de archivos y firmas también vuelven a "consultar"/"trabajar" de SG-SST).
drop policy if exists sst_formato_archivos_select on public.sst_formato_archivos;
drop policy if exists sst_formato_firmas_select on public.sst_formato_firmas;
do $$
declare t text;
begin
  foreach t in array array['sst_plantillas', 'sst_formatos', 'sst_formato_archivos', 'sst_formato_firmas', 'sst_plan_items', 'sst_plan_evidencias'] loop
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('create policy %I on public.%I for select to authenticated using (fn_tiene_permiso(''sgsst'', ''consultar''))', t || '_select', t);
  end loop;
end $$;

-- Plantillas: solo la gestión.
drop policy if exists sst_plantillas_insert on public.sst_plantillas;
create policy sst_plantillas_insert on public.sst_plantillas for insert to authenticated with check (fn_tiene_permiso('sgsst', 'responsable'));
drop policy if exists sst_plantillas_update on public.sst_plantillas;
create policy sst_plantillas_update on public.sst_plantillas for update to authenticated
  using (fn_tiene_permiso('sgsst', 'responsable')) with check (fn_tiene_permiso('sgsst', 'responsable'));

-- Formatos, fotos, firmas, plan y evidencias: SST en obra ("trabajar") y la gestión.
drop policy if exists sst_formatos_insert on public.sst_formatos;
create policy sst_formatos_insert on public.sst_formatos for insert to authenticated with check (fn_tiene_permiso('sgsst', 'trabajar'));
drop policy if exists sst_formatos_update on public.sst_formatos;
create policy sst_formatos_update on public.sst_formatos for update to authenticated
  using (fn_tiene_permiso('sgsst', 'trabajar')) with check (fn_tiene_permiso('sgsst', 'trabajar'));
drop policy if exists sst_formato_archivos_insert on public.sst_formato_archivos;
create policy sst_formato_archivos_insert on public.sst_formato_archivos for insert to authenticated with check (fn_tiene_permiso('sgsst', 'trabajar'));
drop policy if exists sst_formato_firmas_insert on public.sst_formato_firmas;
create policy sst_formato_firmas_insert on public.sst_formato_firmas for insert to authenticated with check (fn_tiene_permiso('sgsst', 'trabajar'));
drop policy if exists sst_plan_items_insert on public.sst_plan_items;
create policy sst_plan_items_insert on public.sst_plan_items for insert to authenticated with check (fn_tiene_permiso('sgsst', 'responsable'));
drop policy if exists sst_plan_items_update on public.sst_plan_items;
create policy sst_plan_items_update on public.sst_plan_items for update to authenticated
  using (fn_tiene_permiso('sgsst', 'trabajar')) with check (fn_tiene_permiso('sgsst', 'trabajar'));
drop policy if exists sst_plan_evidencias_insert on public.sst_plan_evidencias;
create policy sst_plan_evidencias_insert on public.sst_plan_evidencias for insert to authenticated with check (fn_tiene_permiso('sgsst', 'trabajar'));
drop policy if exists sst_plan_evidencias_update on public.sst_plan_evidencias;
create policy sst_plan_evidencias_update on public.sst_plan_evidencias for update to authenticated
  using (fn_tiene_permiso('sgsst', 'trabajar')) with check (fn_tiene_permiso('sgsst', 'trabajar'));

-- Funciones como estaban (75, 77 y 83).
create or replace function public.fn_sst_formato_reglas()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_firmado boolean;
  v_falta text;
begin
  if tg_op = 'DELETE' then
    if current_user in ('postgres', 'supabase_admin') then return old; end if;
    raise exception 'Los formatos de SST no se borran: se anulan con motivo.';
  end if;
  if current_user in ('postgres', 'supabase_admin') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if not exists (select 1 from sst_plantillas p where p.id = new.plantilla_id and p.estado = 'publicada') then
      raise exception 'Solo se llenan plantillas publicadas.';
    end if;
    new.estado := 'borrador';
    new.creado_por := auth.uid();
    new.creado_en := now();
    new.sellado_en := null; new.hash_contenido := null;
    new.aprobado_por := null; new.aprobado_en := null;
    new.anulado_por := null; new.anulado_en := null; new.motivo_anulacion := null;
    return new;
  end if;

  -- UPDATE
  if old.estado = 'anulado' then
    raise exception 'El formato está anulado: no cambia.';
  end if;
  if (new.creado_por, new.creado_en) is distinct from (old.creado_por, old.creado_en) then
    raise exception 'Quién y cuándo lo creó no se cambia.';
  end if;
  v_firmado := fn_sst_formato_tiene_firmas(old.id);
  if (new.plantilla_id, new.proyecto_id, new.cliente_id, new.lugar, new.fecha, new.respuestas)
     is distinct from (old.plantilla_id, old.proyecto_id, old.cliente_id, old.lugar, old.fecha, old.respuestas) then
    if v_firmado or old.estado <> 'borrador' then
      raise exception 'El formato ya tiene firmas: su contenido quedó sellado y no se edita.';
    end if;
    if old.plantilla_id is distinct from new.plantilla_id then
      raise exception 'La plantilla de un formato no se cambia.';
    end if;
    if old.creado_por <> auth.uid() and not fn_tiene_permiso('sgsst', 'responsable') then
      raise exception 'Solo quien lo creó edita el formato (o la gestión SST).';
    end if;
  end if;

  if new.estado is distinct from old.estado then
    if old.estado = 'borrador' and new.estado = 'firmado' then
      -- Cerrar: todas las firmas obligatorias de la plantilla.
      select string_agg(x ->> 'etiqueta', ', ') into v_falta
      from sst_plantillas p, jsonb_array_elements(p.firmas) x
      where p.id = old.plantilla_id
        and coalesce((x ->> 'obligatoria')::boolean, true)
        and not exists (select 1 from sst_formato_firmas s where s.formato_id = old.id and s.rol = x ->> 'rol');
      if v_falta is not null then
        raise exception 'Faltan firmas para cerrarlo: %.', v_falta;
      end if;
      new.sellado_en := now();
      new.hash_contenido := fn_sst_hash_formato(old.id);
    elsif old.estado = 'firmado' and new.estado = 'aprobado' then
      if not fn_tiene_permiso('sgsst', 'responsable') then
        raise exception 'Solo la gestión SST aprueba formatos.';
      end if;
      new.aprobado_por := auth.uid();
      new.aprobado_en := now();
    elsif new.estado = 'anulado' then
      if not fn_tiene_permiso('sgsst', 'responsable') then
        raise exception 'Solo la gestión SST anula formatos.';
      end if;
      if length(trim(coalesce(new.motivo_anulacion, ''))) = 0 then
        raise exception 'Escribe por qué se anula el formato.';
      end if;
      new.anulado_por := auth.uid();
      new.anulado_en := now();
    else
      raise exception 'Un formato no pasa de "%" a "%".', old.estado, new.estado;
    end if;
  end if;
  if new.estado is not distinct from old.estado
     and (new.sellado_en, new.hash_contenido, new.aprobado_por, new.aprobado_en, new.anulado_por, new.anulado_en, new.motivo_anulacion)
         is distinct from (old.sellado_en, old.hash_contenido, old.aprobado_por, old.aprobado_en, old.anulado_por, old.anulado_en, old.motivo_anulacion) then
    raise exception 'El sello, la aprobación y la anulación los pone la base.';
  end if;
  return new;
end;
$$;
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
create or replace function public.fn_sst_formato_integro(p_formato_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select f.hash_contenido is not null
     and f.hash_contenido = fn_sst_hash_formato(f.id)
     and not exists (select 1 from sst_formato_firmas x where x.formato_id = f.id and x.hash_contenido <> f.hash_contenido)
  from sst_formatos f
  where f.id = p_formato_id and fn_tiene_permiso('sgsst', 'consultar');
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
create or replace function public.fn_sst_personal()
returns table (id uuid, perfil_id uuid, nombre text, cargo text, estado_laboral text)
language sql
stable
security definer
set search_path = public
as $$
  select e.id, e.perfil_id, trim(e.primer_nombre || ' ' || e.primer_apellido || coalesce(' ' || e.segundo_apellido, '')), e.cargo, e.estado_laboral
  from empleados e
  where fn_tiene_permiso('sgsst', 'consultar')
  order by 3;
$$;
create or replace function public.fn_sst_archivo_subible(p_nombre text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case (storage.foldername(p_nombre))[1]
    when 'formatos' then fn_tiene_permiso('sgsst', 'trabajar')
      and exists (select 1 from sst_formatos f where f.id::text = (storage.foldername(p_nombre))[2] and f.estado = 'borrador')
    when 'plan' then fn_tiene_permiso('sgsst', 'trabajar')
      and exists (select 1 from sst_plan_items i where i.id::text = (storage.foldername(p_nombre))[2] and i.archivado_en is null)
    when 'reportes' then exists (select 1 from sst_reportes_inseguros r where r.id::text = (storage.foldername(p_nombre))[2]
                                 and r.reportado_por = auth.uid() and r.estado = 'nuevo')
    when 'eventos' then fn_tiene_permiso('sgsst', 'trabajar')
      and exists (select 1 from sst_eventos e where e.id::text = (storage.foldername(p_nombre))[2] and e.estado in ('abierto', 'investigado'))
    else false
  end;
$$;
create or replace function public.fn_sst_archivo_visible(p_nombre text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select fn_tiene_permiso('sgsst', 'consultar')
      or ((storage.foldername(p_nombre))[1] = 'reportes'
          and exists (select 1 from sst_reportes_inseguros r where r.id::text = (storage.foldername(p_nombre))[2] and r.reportado_por = auth.uid()));
$$;

drop trigger if exists trg_sst_formato_ambito on public.sst_formatos;
drop trigger if exists trg_sst_plantilla_ambito on public.sst_plantillas;
drop function if exists public.fn_sst_formato_ambito_regla();
drop function if exists public.fn_sst_plantilla_ambito();
drop function if exists public.fn_sst_formato_ambito(uuid);
drop function if exists public.fn_plantillas_gestion(text);
drop function if exists public.fn_plantillas_permiso(text, nivel_permiso);
drop index if exists public.idx_sst_formatos_ambito;
drop index if exists public.idx_sst_plantillas_ambito;
alter table public.sst_formatos drop constraint if exists sst_formatos_obra_en_proyectos;
alter table public.sst_formatos drop column if exists ambito;
alter table public.sst_plantillas drop column if exists ambito;
