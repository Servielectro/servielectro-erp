-- "Documentos por firmar" dentro del módulo Técnico.
--
-- Problema: el rol Técnicos no tiene permiso sobre el módulo sgsst, así que no podían
-- ver ni firmar la capacitación. Darles el módulo completo les abriría Personal
-- (historias clínicas), así que no se hace.
--
-- Solución: se convoca a un USUARIO DE LA APP (perfiles.id) a un formato concreto.
-- Ser convocado no da permiso sobre SG-SST: da permiso sobre ESE formato y nada más,
-- y solo mientras esté en borrador. El técnico lo ve en su propio módulo.
--
-- Nada de esto afloja las reglas de firma existentes:
--   * solo firma quien fue convocado, y solo con SU cédula;
--   * solo en estado borrador;
--   * una firma registrada sigue sin poderse cambiar ni borrar.

-- ============================================================ 1) a quién se convoca

create table if not exists public.sst_formato_convocados (
  id            uuid primary key default gen_random_uuid(),
  formato_id    uuid not null references public.sst_formatos(id) on delete cascade,
  perfil_id     uuid not null references public.perfiles(id) on delete cascade,
  nombre        text not null,
  documento     text not null,
  cargo         text,
  convocado_por uuid not null default auth.uid() references auth.users(id),
  convocado_en  timestamptz not null default now(),
  constraint sst_formato_convocados_nombre_check    check (length(trim(nombre)) > 0),
  constraint sst_formato_convocados_documento_check check (length(trim(documento)) > 0)
);

-- Una persona se convoca una sola vez por formato, y una cédula no se repite.
create unique index if not exists sst_formato_convocados_perfil_uk
  on public.sst_formato_convocados (formato_id, perfil_id);
create unique index if not exists sst_formato_convocados_doc_uk
  on public.sst_formato_convocados (formato_id, public.fn_sst_doc(documento));
create index if not exists sst_formato_convocados_perfil_ix
  on public.sst_formato_convocados (perfil_id);

-- ============================================================ 2) ¿estoy convocado?

create or replace function public.fn_sst_convocado(p_formato uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.sst_formato_convocados c
    where c.formato_id = p_formato and c.perfil_id = auth.uid()
  );
$$;

-- La cédula con la que fui convocado a ese formato (null si no lo estoy).
create or replace function public.fn_sst_convocado_doc(p_formato uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select c.documento from public.sst_formato_convocados c
  where c.formato_id = p_formato and c.perfil_id = auth.uid()
  limit 1;
$$;

-- ¿Tiene lista de convocados? (sirve como lista de asistentes)
create or replace function public.fn_sst_tiene_convocados(p_formato uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.sst_formato_convocados c where c.formato_id = p_formato);
$$;

-- ============================================================ 3) reglas de firma

-- Se agrega el camino del convocado al control de permiso. El resto queda igual.
create or replace function public.fn_sst_firma_reglas()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_falta text[];
  v_estado text;
  v_ambito text;
  v_previa record;
begin
  if current_user in ('postgres', 'supabase_admin') then
    return coalesce(new, old);
  end if;
  if tg_op <> 'INSERT' then
    raise exception 'Una firma registrada no se cambia ni se borra.';
  end if;
  if fn_sst_firma_existe(new.id) then
    select * into v_previa from fn_sst_firma_registro(new.id);
    new.registrada_por := v_previa.registrada_por;
    new.recibida_en := v_previa.recibida_en;
    new.hash_contenido := v_previa.hash_contenido;
    return new;
  end if;
  select e.estado, e.ambito into v_estado, v_ambito from fn_sst_formato_estado_ambito(new.formato_id) e;
  if v_estado is null then
    raise exception 'Ese formato no existe.';
  end if;
  -- Camino 1: tiene permiso sobre el módulo. Camino 2: fue convocado a este formato.
  if not fn_plantillas_permiso(v_ambito, 'trabajar') and not fn_sst_convocado(new.formato_id) then
    raise exception 'No tienes permiso para firmar formatos de %.', case v_ambito when 'proyectos' then 'Proyectos' else 'SG-SST' end;
  end if;
  if v_estado <> 'borrador' then
    raise exception 'El formato ya está cerrado: no recibe más firmas.';
  end if;
  -- El convocado firma por sí mismo: nunca por otro, y solo como participante.
  if not fn_plantillas_permiso(v_ambito, 'trabajar') then
    if new.rol <> 'tecnico' then
      raise exception 'Solo puedes firmar como participante.';
    end if;
    if fn_sst_doc(new.documento) is distinct from fn_sst_doc(fn_sst_convocado_doc(new.formato_id)) then
      raise exception 'Solo puedes firmar con tu propia cédula.';
    end if;
  end if;
  if not fn_sst_formato_tiene_firmas(new.formato_id) then
    v_falta := fn_sst_faltantes(new.formato_id);
    if array_length(v_falta, 1) > 0 then
      raise exception 'Antes de firmar falta llenar: %.', array_to_string(v_falta, ', ');
    end if;
  end if;
  if new.firmada_en_dispositivo > now() + interval '10 minutes' then
    raise exception 'La hora de la firma en el dispositivo está adelantada: revisa el reloj del celular.';
  end if;
  new.registrada_por := auth.uid();
  new.recibida_en := now();
  new.hash_contenido := fn_sst_hash_formato(new.formato_id);
  return new;
end;
$$;

-- La lista de convocados vale como lista de asistentes.
create or replace function public.fn_sst_tecnicos_firma()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_lista jsonb;
  v_dia date;
  v_conv boolean;
begin
  if current_user in ('postgres', 'supabase_admin') then
    return new;
  end if;
  if fn_sst_firma_existe(new.id) then
    return new;
  end if;
  v_lista := fn_sst_tecnicos_de(new.formato_id);
  v_dia := (new.firmada_en_dispositivo at time zone 'America/Bogota')::date;
  v_conv := fn_sst_tiene_convocados(new.formato_id);

  -- Si hay convocados, esa es la lista; si no, se exige la de técnicos en obra.
  if not fn_sst_formato_tiene_firmas(new.formato_id) and fn_sst_pide_tecnicos(new.formato_id)
     and not v_conv and coalesce(jsonb_array_length(v_lista), 0) = 0 then
    raise exception 'Antes de firmar, anota los técnicos que estuvieron en la obra (nombre y cédula): firman todos.';
  end if;

  if new.rol = 'tecnico' then
    -- Debe estar en alguna de las dos listas.
    if v_conv then
      if not exists (select 1 from sst_formato_convocados c
                     where c.formato_id = new.formato_id
                       and fn_sst_doc(c.documento) = fn_sst_doc(new.documento))
         and (v_lista is null or not exists (select 1 from jsonb_array_elements(v_lista) t
                                             where fn_sst_doc(t ->> 'documento') = fn_sst_doc(new.documento))) then
        raise exception 'La cédula % no está convocada a este formato.', new.documento;
      end if;
    elsif v_lista is not null then
      if not exists (select 1 from jsonb_array_elements(v_lista) t where fn_sst_doc(t ->> 'documento') = fn_sst_doc(new.documento)) then
        raise exception 'La cédula % no está en la lista de técnicos que estuvieron en la obra.', new.documento;
      end if;
    end if;

    if fn_sst_firma_diaria(new.formato_id, 'tecnico') then
      if exists (select 1 from sst_formato_firmas s where s.formato_id = new.formato_id and s.rol = 'tecnico'
                 and fn_sst_doc(s.documento) = fn_sst_doc(new.documento)
                 and (s.firmada_en_dispositivo at time zone 'America/Bogota')::date = v_dia) then
        raise exception 'Ese técnico ya firmó este formato el %.', to_char(v_dia, 'DD/MM/YYYY');
      end if;
    elsif exists (select 1 from sst_formato_firmas s where s.formato_id = new.formato_id and s.rol = 'tecnico'
                  and fn_sst_doc(s.documento) = fn_sst_doc(new.documento)) then
      raise exception 'Ese técnico ya firmó este formato.';
    end if;
  end if;

  if new.rol <> 'tecnico' and fn_sst_firma_diaria(new.formato_id, new.rol)
     and exists (select 1 from sst_formato_firmas s where s.formato_id = new.formato_id and s.rol = new.rol
                 and (s.firmada_en_dispositivo at time zone 'America/Bogota')::date = v_dia) then
    raise exception 'Ese bloque ya tiene su firma del %.', to_char(v_dia, 'DD/MM/YYYY');
  end if;
  return new;
end;
$$;

-- El convocado también puede abrir el material obligatorio.
create or replace function public.fn_sst_material_abrir(
  p_material uuid, p_formato uuid, p_persona text, p_documento text, p_dispositivo text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if coalesce(public.fn_permiso_seccion('sgsst', 'capacitaciones') >= 'trabajar', false) is not true
     and not (p_formato is not null and public.fn_sst_convocado(p_formato)) then
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

-- ============================================================ 4) lo que ve el convocado

alter table public.sst_formato_convocados enable row level security;
revoke all on public.sst_formato_convocados from public, anon, authenticated;
grant select on public.sst_formato_convocados to authenticated;
grant insert, delete on public.sst_formato_convocados to authenticated;

-- Quien gestiona SG-SST convoca y desconvoca; el técnico solo se ve a sí mismo.
drop policy if exists sst_convocados_gestion on public.sst_formato_convocados;
create policy sst_convocados_gestion on public.sst_formato_convocados
  for select to authenticated
  using (public.fn_plantillas_permiso(public.fn_sst_formato_ambito(formato_id), 'consultar'));

drop policy if exists sst_convocados_propios on public.sst_formato_convocados;
create policy sst_convocados_propios on public.sst_formato_convocados
  for select to authenticated
  using (perfil_id = auth.uid());

drop policy if exists sst_convocados_insert on public.sst_formato_convocados;
create policy sst_convocados_insert on public.sst_formato_convocados
  for insert to authenticated
  with check (public.fn_plantillas_permiso(public.fn_sst_formato_ambito(formato_id), 'trabajar'));

-- Se puede quitar a alguien solo mientras el formato esté en borrador y no haya firmado.
drop policy if exists sst_convocados_delete on public.sst_formato_convocados;
create policy sst_convocados_delete on public.sst_formato_convocados
  for delete to authenticated
  using (
    public.fn_plantillas_permiso(public.fn_sst_formato_ambito(formato_id), 'trabajar')
    and exists (select 1 from public.sst_formatos f where f.id = formato_id and f.estado = 'borrador')
    and not exists (
      select 1 from public.sst_formato_firmas s
      where s.formato_id = sst_formato_convocados.formato_id
        and public.fn_sst_doc(s.documento) = public.fn_sst_doc(sst_formato_convocados.documento)
    )
  );

-- El convocado ve SU formato, su plantilla, el material y las firmas de ese formato.
drop policy if exists sst_formatos_select_convocado on public.sst_formatos;
create policy sst_formatos_select_convocado on public.sst_formatos
  for select to authenticated
  using (public.fn_sst_convocado(id));

drop policy if exists sst_plantillas_select_convocado on public.sst_plantillas;
create policy sst_plantillas_select_convocado on public.sst_plantillas
  for select to authenticated
  using (exists (
    select 1 from public.sst_formatos f
    where f.plantilla_id = sst_plantillas.id and public.fn_sst_convocado(f.id)
  ));

drop policy if exists sst_formato_firmas_select_convocado on public.sst_formato_firmas;
create policy sst_formato_firmas_select_convocado on public.sst_formato_firmas
  for select to authenticated
  using (public.fn_sst_convocado(formato_id));

drop policy if exists sst_formato_firmas_insert_convocado on public.sst_formato_firmas;
create policy sst_formato_firmas_insert_convocado on public.sst_formato_firmas
  for insert to authenticated
  with check (public.fn_sst_convocado(formato_id));

drop policy if exists sst_materiales_convocado on public.sst_materiales;
create policy sst_materiales_convocado on public.sst_materiales
  for select to authenticated
  using (
    estado = 'publicado'
    and exists (
      select 1 from public.sst_formato_convocados c
      join public.sst_formatos f on f.id = c.formato_id and f.estado = 'borrador'
      where c.perfil_id = auth.uid()
    )
  );

drop policy if exists sst_plantilla_materiales_convocado on public.sst_plantilla_materiales;
create policy sst_plantilla_materiales_convocado on public.sst_plantilla_materiales
  for select to authenticated
  using (exists (
    select 1 from public.sst_formatos f
    where f.plantilla_id = sst_plantilla_materiales.plantilla_id and public.fn_sst_convocado(f.id)
  ));

drop policy if exists sst_material_lecturas_convocado on public.sst_material_lecturas;
create policy sst_material_lecturas_convocado on public.sst_material_lecturas
  for select to authenticated
  using (leido_por = auth.uid());

-- Storage: el convocado abre el material de su capacitación.
drop policy if exists sgsst_materiales_select on storage.objects;
create policy sgsst_materiales_select on storage.objects for select to authenticated
  using (
    bucket_id = 'sgsst'
    and (storage.foldername(name))[1] = 'materiales'
    and (
      public.fn_permiso_seccion('sgsst', 'capacitaciones') is not null
      or public.fn_permiso_seccion('sgsst', 'materiales') is not null
      or exists (
        select 1 from public.sst_formato_convocados c
        join public.sst_formatos f on f.id = c.formato_id and f.estado = 'borrador'
        where c.perfil_id = auth.uid()
      )
    )
  );

-- Las firmas se suben a formatos/<id>/firma-...: el convocado necesita poder subir la suya.
drop policy if exists sgsst_firma_convocado_insert on storage.objects;
create policy sgsst_firma_convocado_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'sgsst'
    and (storage.foldername(name))[1] = 'formatos'
    and public.fn_sst_convocado(((storage.foldername(name))[2])::uuid)
  );

-- ============================================================ 5) la bandeja del técnico

create or replace view public.v_mis_documentos_por_firmar
with (security_invoker = true) as
select
  f.id                                   as formato_id,
  p.codigo                               as codigo,
  p.nombre                               as formato,
  f.fecha,
  f.lugar,
  f.respuestas ->> 'tema'                as tema,
  f.estado,
  c.nombre                               as mi_nombre,
  c.documento                            as mi_documento,
  c.cargo                                as mi_cargo,
  c.convocado_en,
  exists (
    select 1 from public.sst_formato_firmas s
    where s.formato_id = f.id and s.rol = 'tecnico'
      and public.fn_sst_doc(s.documento) = public.fn_sst_doc(c.documento)
  )                                      as ya_firme,
  (select m.id from public.sst_plantilla_materiales pm
     join public.sst_materiales m on m.codigo = pm.codigo and m.estado = 'publicado'
    where pm.plantilla_id = p.id limit 1) as material_id
from public.sst_formato_convocados c
join public.sst_formatos  f on f.id = c.formato_id
join public.sst_plantillas p on p.id = f.plantilla_id
where c.perfil_id = auth.uid()
  and f.estado = 'borrador';

grant select on public.v_mis_documentos_por_firmar to authenticated;

-- ============================================================ 6) la sección del menú

insert into public.modulo_secciones (modulo_id, seccion_id, nombre, href, orden)
values ('tecnico', 'por_firmar', 'Documentos por firmar', '/tecnico/por-firmar', 5)
on conflict (modulo_id, seccion_id) do nothing;

-- ============================================================ 7) privilegios

revoke all on function public.fn_sst_convocado(uuid)        from public, anon;
revoke all on function public.fn_sst_convocado_doc(uuid)    from public, anon;
revoke all on function public.fn_sst_tiene_convocados(uuid) from public, anon;
grant execute on function public.fn_sst_convocado(uuid)        to authenticated;
grant execute on function public.fn_sst_convocado_doc(uuid)    to authenticated;
grant execute on function public.fn_sst_tiene_convocados(uuid) to authenticated;

comment on table public.sst_formato_convocados is
  'Usuarios de la app convocados a firmar un formato. Ser convocado da acceso a ESE formato en borrador y nada más: no otorga permiso sobre el módulo SG-SST.';
comment on view public.v_mis_documentos_por_firmar is
  'Bandeja del técnico: formatos en borrador a los que fue convocado y si ya firmó.';
