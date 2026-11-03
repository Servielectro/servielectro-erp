-- Inducción y reinducción SG-SST: FOR-02 en el motor de formatos + material de capacitación.
--
-- No se crea un motor nuevo. FOR-02 es una plantilla más de sst_plantillas:
--   sst_formatos        -> una sesión de capacitación (encabezado en respuestas jsonb)
--   sst_formato_firmas  -> rol 'tecnico' = cada participante; 'responsable_sst' = el capacitador
-- Lo único que falta en la casa es dónde vive el material que el técnico debe leer
-- antes de firmar, y el puente para que la capacitación caiga sola en la hoja de vida.

-- 1) Material de capacitación (la presentación de inducción, futuros instructivos)

create table if not exists public.sst_materiales (
  id              uuid primary key default gen_random_uuid(),
  codigo          text not null,
  nombre          text not null,
  version         integer not null default 1,
  descripcion     text,
  path            text not null,
  nombre_archivo  text not null,
  mime            text,
  bytes           bigint,
  sha256          text not null,
  minutos_lectura integer,
  estado          text not null default 'borrador',
  vigente_desde   date,
  subido_por      uuid not null default auth.uid() references auth.users(id),
  subido_en       timestamptz not null default now(),
  archivado_en    timestamptz,
  archivado_por   uuid references auth.users(id),
  motivo_archivo  text,
  updated_at      timestamptz not null default now(),
  constraint sst_materiales_codigo_check  check (length(trim(codigo)) > 0),
  constraint sst_materiales_nombre_check  check (length(trim(nombre)) > 0),
  constraint sst_materiales_version_check check (version > 0),
  constraint sst_materiales_sha256_check  check (sha256 ~ '^[0-9a-f]{64}$'),
  constraint sst_materiales_estado_check  check (estado in ('borrador','publicado','archivado')),
  constraint sst_materiales_archivo       check (estado <> 'archivado' or length(trim(coalesce(motivo_archivo,''))) > 0),
  constraint sst_materiales_publicado     check (estado <> 'publicado' or vigente_desde is not null)
);

create unique index if not exists sst_materiales_codigo_version_uk
  on public.sst_materiales (codigo, version);

-- Un solo material publicado por código a la vez.
create unique index if not exists sst_materiales_publicado_uk
  on public.sst_materiales (codigo) where estado = 'publicado';

-- 2) Qué material exige cada plantilla antes de firmar

create table if not exists public.sst_plantilla_materiales (
  plantilla_id uuid not null references public.sst_plantillas(id) on delete cascade,
  codigo       text not null,
  obligatorio  boolean not null default true,
  primary key (plantilla_id, codigo)
);

-- 3) Acuse de lectura: quién abrió el material y cuánto tiempo estuvo

create table if not exists public.sst_material_lecturas (
  id           uuid primary key default gen_random_uuid(),
  material_id  uuid not null references public.sst_materiales(id) on delete cascade,
  formato_id   uuid references public.sst_formatos(id) on delete cascade,
  persona      text not null,
  documento    text not null,
  abierto_en   timestamptz not null default now(),
  cerrado_en   timestamptz,
  segundos     integer,
  dispositivo  text,
  leido_por    uuid not null default auth.uid() references auth.users(id),
  constraint sst_material_lecturas_persona_check   check (length(trim(persona)) > 0),
  constraint sst_material_lecturas_documento_check check (length(trim(documento)) > 0),
  constraint sst_material_lecturas_segundos_check  check (segundos is null or segundos >= 0),
  constraint sst_material_lecturas_orden           check (cerrado_en is null or cerrado_en >= abierto_en)
);

create index if not exists sst_material_lecturas_formato_ix
  on public.sst_material_lecturas (formato_id);
create index if not exists sst_material_lecturas_documento_ix
  on public.sst_material_lecturas (documento);

-- updated_at

drop trigger if exists sst_materiales_updated on public.sst_materiales;
create trigger sst_materiales_updated
  before update on public.sst_materiales
  for each row execute function extensions.moddatetime(updated_at);

-- 4) La plantilla FOR-02 V4, tal como está el formato en papel

insert into public.sst_plantillas (codigo, nombre, version, descripcion, ambito, estado, publicada_en, control, campos, firmas)
select
  'FOR-02',
  'Asistencia a capacitaciones inducción o re-inducción',
  4,
  'Registro de asistencia y firma de inducción, reinducción y capacitaciones específicas.',
  'sgsst',
  'publicada',
  now(),
  jsonb_build_object('codigo','FOR-02','version','04','fecha','2026-06-01'),
  $campos$[
    {"id":"tema","tipo":"texto_largo","etiqueta":"Tema de la capacitación y/o entrenamiento","obligatorio":true},
    {"id":"objetivo","tipo":"texto_largo","etiqueta":"Objetivo de la capacitación y/o entrenamiento","obligatorio":true},
    {"id":"hora_realizacion","tipo":"hora","etiqueta":"Hora de realización","obligatorio":true},
    {"id":"registro_competencia","tipo":"casillas","etiqueta":"Registro de competencia","obligatorio":true,
     "opciones":["Inducción SG-SST","Reinducción anual","Capacitación específica","Entrenamiento práctico","Socialización de procedimiento","Otro"]},
    {"id":"registro_competencia_otro","tipo":"texto","etiqueta":"Otro, ¿cuál?",
     "ayuda":"Solo si marcó Otro en registro de competencia."},
    {"id":"intensidad_horas","tipo":"numero","etiqueta":"Intensidad de la capacitación (horas)","obligatorio":true},
    {"id":"dirigida_por","tipo":"texto","etiqueta":"Persona que dirigió la capacitación","obligatorio":true},
    {"id":"metodologia","tipo":"texto","etiqueta":"Metodología","obligatorio":true},
    {"id":"proceso_area","tipo":"texto","etiqueta":"Proceso o área","obligatorio":true}
  ]$campos$::jsonb,
  $firmas$[
    {"rol":"tecnico","etiqueta":"Participante","obligatoria":true,"repetible":true,
     "pide":["nombre","documento","cargo"]},
    {"rol":"responsable_sst","etiqueta":"Firma capacitador","obligatoria":true}
  ]$firmas$::jsonb
where not exists (
  select 1 from public.sst_plantillas where codigo = 'FOR-02' and version = 4
);

-- La inducción 2026 exige leer la presentación antes de firmar.
insert into public.sst_plantilla_materiales (plantilla_id, codigo, obligatorio)
select p.id, 'IND-SGSST', true
from public.sst_plantillas p
where p.codigo = 'FOR-02' and p.version = 4
on conflict do nothing;

-- 5) Puente a la hoja de vida: al sellar el FOR-02, cada participante
--    queda con su constancia de capacitación en persona_documentos.

create or replace function public.fn_sst_capacitacion_a_hojas_de_vida()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_codigo text;
  v_tema   text;
  v_horas  numeric;
  v_fecha  date;
  v_fila   record;
  v_emp    uuid;
  v_ins    integer := 0;
begin
  -- Solo cuando un formato pasa a firmado/aprobado y es un FOR-02.
  if new.estado not in ('firmado','aprobado') then
    return new;
  end if;
  if old.estado = new.estado then
    return new;
  end if;

  select pl.codigo into v_codigo
  from public.sst_plantillas pl
  where pl.id = new.plantilla_id;

  if v_codigo is distinct from 'FOR-02' then
    return new;
  end if;

  v_tema  := nullif(trim(new.respuestas->>'tema'), '');
  v_horas := nullif(new.respuestas->>'intensidad_horas', '')::numeric;
  v_fecha := new.fecha;

  if v_tema is null then
    raise exception 'El FOR-02 % no puede sellarse sin tema de la capacitación.', new.id;
  end if;

  for v_fila in
    select f.nombre, f.documento, f.cargo
    from public.sst_formato_firmas f
    where f.formato_id = new.id and f.rol = 'tecnico'
  loop
    -- Se busca al empleado por cédula. Si es alguien externo, no se inventa ficha.
    select e.id into v_emp
    from public.empleados e
    where regexp_replace(coalesce(e.numero_documento,''), '\D', '', 'g')
        = regexp_replace(v_fila.documento, '\D', '', 'g')
      and regexp_replace(v_fila.documento, '\D', '', 'g') <> ''
    limit 1;

    if v_emp is null then
      continue;
    end if;

    insert into public.persona_documentos
      (empleado_id, tipo, nombre, tema, horas, fecha_documento, path, nombre_archivo, sha256, notas, subido_por)
    select
      v_emp,
      'capacitacion',
      v_tema,
      v_tema,
      v_horas,
      v_fecha,
      'formatos/' || new.id::text || '/for02.pdf',
      'FOR-02 ' || to_char(v_fecha, 'YYYY-MM-DD') || '.pdf',
      coalesce(new.hash_contenido, repeat('0', 64)),
      'Generado automáticamente al sellar el FOR-02 ' || new.id::text,
      new.creado_por
    where not exists (
      select 1 from public.persona_documentos pd
      where pd.empleado_id = v_emp
        and pd.tipo = 'capacitacion'
        and pd.notas = 'Generado automáticamente al sellar el FOR-02 ' || new.id::text
    );

    v_ins := v_ins + 1;
  end loop;

  return new;
end;
$$;

revoke all on function public.fn_sst_capacitacion_a_hojas_de_vida() from public, anon, authenticated;

drop trigger if exists sst_formatos_capacitacion_hv on public.sst_formatos;
create trigger sst_formatos_capacitacion_hv
  after update of estado on public.sst_formatos
  for each row execute function public.fn_sst_capacitacion_a_hojas_de_vida();

-- 6) Vista de consulta: cómo va cada sesión de capacitación

create or replace view public.v_sst_capacitaciones
with (security_invoker = true) as
select
  f.id,
  f.fecha,
  f.respuestas->>'tema'              as tema,
  f.respuestas->>'objetivo'          as objetivo,
  f.respuestas->>'hora_realizacion'  as hora,
  f.lugar,
  f.respuestas->>'dirigida_por'      as dirigida_por,
  f.respuestas->>'metodologia'       as metodologia,
  f.respuestas->>'proceso_area'      as proceso_area,
  nullif(f.respuestas->>'intensidad_horas','')::numeric as intensidad_horas,
  f.respuestas->'registro_competencia' as registro_competencia,
  f.estado,
  f.sellado_en,
  (select count(*) from public.sst_formato_firmas s
     where s.formato_id = f.id and s.rol = 'tecnico')          as participantes,
  exists (select 1 from public.sst_formato_firmas s
     where s.formato_id = f.id and s.rol = 'responsable_sst')  as firmo_capacitador,
  f.creado_por,
  f.creado_en
from public.sst_formatos f
join public.sst_plantillas p on p.id = f.plantilla_id
where p.codigo = 'FOR-02';

-- 6b) La sección nueva del menú

insert into public.modulo_secciones (modulo_id, seccion_id, nombre, href, orden)
values ('sgsst','capacitaciones','Capacitaciones e inducción','/sgsst/capacitaciones',12)
on conflict (modulo_id, seccion_id) do nothing;

-- 7) Permisos

alter table public.sst_materiales            enable row level security;
alter table public.sst_plantilla_materiales  enable row level security;
alter table public.sst_material_lecturas     enable row level security;

revoke all on public.sst_materiales           from public, anon, authenticated;
revoke all on public.sst_plantilla_materiales from public, anon, authenticated;
revoke all on public.sst_material_lecturas    from public, anon, authenticated;

grant select                         on public.sst_materiales           to authenticated;
grant select                         on public.sst_plantilla_materiales to authenticated;
grant select, insert, update         on public.sst_material_lecturas    to authenticated;
grant select                         on public.v_sst_capacitaciones     to authenticated;

-- El material publicado lo ve cualquiera que tenga la sección de SG-SST.
drop policy if exists sst_materiales_lectura on public.sst_materiales;
create policy sst_materiales_lectura on public.sst_materiales
  for select to authenticated
  using (estado = 'publicado' and public.fn_permiso_seccion('sgsst','capacitaciones') is not null);

drop policy if exists sst_plantilla_materiales_lectura on public.sst_plantilla_materiales;
create policy sst_plantilla_materiales_lectura on public.sst_plantilla_materiales
  for select to authenticated
  using (public.fn_permiso_seccion('sgsst','capacitaciones') is not null);

-- El acuse de lectura lo escribe quien lee, y nadie edita el de otro.
drop policy if exists sst_material_lecturas_propias on public.sst_material_lecturas;
create policy sst_material_lecturas_propias on public.sst_material_lecturas
  for select to authenticated
  using (public.fn_permiso_seccion('sgsst','capacitaciones') is not null);

drop policy if exists sst_material_lecturas_insertar on public.sst_material_lecturas;
create policy sst_material_lecturas_insertar on public.sst_material_lecturas
  for insert to authenticated
  with check (leido_por = auth.uid() and public.fn_permiso_seccion('sgsst','capacitaciones') >= 'trabajar');

drop policy if exists sst_material_lecturas_cerrar on public.sst_material_lecturas;
create policy sst_material_lecturas_cerrar on public.sst_material_lecturas
  for update to authenticated
  using (leido_por = auth.uid())
  with check (leido_por = auth.uid());

comment on table public.sst_materiales is
  'Material de capacitación (presentaciones, instructivos) que el trabajador debe leer antes de firmar.';
comment on table public.sst_material_lecturas is
  'Acuse de lectura del material: evidencia de que el participante lo abrió antes de firmar el FOR-02.';
comment on view public.v_sst_capacitaciones is
  'Una fila por sesión de capacitación FOR-02, con participantes firmados y estado.';
