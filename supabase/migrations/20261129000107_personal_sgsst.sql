-- Personal en SG-SST (2026-10-29). Jhojan: un submódulo donde la encargada de SST vea, de cada
-- persona de nómina y de cada contratista, su documentación (exámenes, afiliaciones, EPP…), y que
-- RRHH y SG-SST "se complementen entre ellos". UNA ficha de persona, dos áreas que la alimentan,
-- cada una dueña de su parte; el dato vive en un solo lugar y cada módulo lo ve según su permiso.
--
-- Quién es quién:
--   - La persona de nómina es la ficha de RRHH (empleados, migración 66). SG-SST NO la copia: la lee
--     con fn_sst_personal_ficha(), que entrega solo columnas sin plata (sin salario, bonificación
--     ni rodamiento). Crear o cambiar la ficha sigue siendo de RRHH.
--   - El trabajador de un contratista no existía como entidad (solo como renglón de cada planilla
--     mensual, migración 87): contratista_trabajadores. Lo crea SG-SST o Administrativo.
--
-- persona_documentos: los documentos de cada persona, con su vigencia. Dueño por tipo:
--   aptitud_ocupacional, certificado_alturas, capacitacion  → SG-SST "trabajar"
--   certificado_afiliacion (EPS, AFP, ARL, CCF), otro      → SG-SST o RRHH "trabajar"; SG-SST verifica
--   historia_clinica                                       → ver abajo
-- Los ve SG-SST "consultar" y RRHH "trabajar" (las dos áreas). El ACCESO nombra a SG-SST, como
-- fn_contratista_ve_planillas (87): Victoria (rol SG-SST, sin RRHH) ve sin pasar por nómina.
--
-- LO MÉDICO (Jhojan quiere oír a Victoria antes de cerrarlo; el modelo queda listo):
--   - El CERTIFICADO DE APTITUD (apto / apto con restricciones / no apto) y las RECOMENDACIONES
--     laborales son dato de gestión: el empleador los debe tener para asignar o no un trabajo.
--     Van en aptitud_ocupacional, con quién custodia la historia clínica (custodia_ips).
--   - La HISTORIA CLÍNICA (diagnósticos, resultados, antecedentes) es del médico. El tipo existe
--     para el caso en que haga falta, pero: queda RESERVADO siempre (lo fuerza la base), en la
--     carpeta reservado/, y solo lo ve quien tiene SG-SST CON datos sensibles (ni RRHH ni el
--     administrador por serlo). La pantalla no lo ofrece por defecto: lo normal es registrar quién
--     la custodia, no subirla.
--
-- EPP: la entrega es de RRHH (dotacion_entregas, migración 66). SG-SST la ve (solo las de EPP) y
-- también puede registrar entregas de EPP (en obra las suele hacer ella). Lo que SG-SST completa
-- va en sus tablas: epp_seguimiento (capacitación en el uso, vida útil y fecha de reposición) y
-- epp_inspecciones (cada inspección del elemento).
--
-- Vencimientos: persona_documentos.vence_en y epp_seguimiento.reponer_en son lo que leerá el motor
-- de vencimientos (106). "Cumplido" = hay uno más nuevo del mismo tipo para la misma persona.
-- La pregunta "¿estaba vigente el día X?" usa vigente_desde/vence_en del documento que cubría esa
-- fecha, no el último (Actas de obra, cara 2).
--
-- Nada se borra: los documentos se archivan con motivo; las inspecciones solo suman.
-- Va después de la 66 y la 87. Idempotente.
-- Verificación: supabase/verificaciones/20261129000107_verificar.sql
-- Rollback:     supabase/rollbacks/20261129000107_personal_sgsst_down.sql

-- ============================================================ 1) acceso
-- Quién ve el personal y sus documentos: SG-SST "consultar" o RRHH "trabajar".
create or replace function public.fn_persona_sst_ve()
returns boolean language sql stable set search_path = public as $$
  select fn_tiene_permiso('sgsst', 'consultar') or fn_tiene_permiso('rrhh', 'trabajar');
$$;

-- Quién registra un documento de ese tipo.
create or replace function public.fn_persona_doc_puede(p_tipo text)
returns boolean language sql stable set search_path = public as $$
  select case
    when p_tipo in ('aptitud_ocupacional', 'certificado_alturas', 'capacitacion', 'historia_clinica') then fn_tiene_permiso('sgsst', 'trabajar')
    when p_tipo in ('certificado_afiliacion', 'otro') then fn_tiene_permiso('sgsst', 'trabajar') or fn_tiene_permiso('rrhh', 'trabajar')
    else false
  end;
$$;

-- La ficha de nómina SIN plata, para quien ve el personal.
create or replace function public.fn_sst_personal_ficha()
returns table (
  id uuid, perfil_id uuid, nombre text, tipo_documento text, numero_documento text, cargo text, area text,
  estado_laboral text, fecha_ingreso date, fecha_retiro date, tipo_contrato text, fecha_nacimiento date, rh text,
  eps text, afp text, arl text, caja_compensacion text, contacto_emergencia text, telefono_emergencia text,
  telefono text, talla_camisa text, talla_pantalon text, talla_botas text)
language sql stable security definer set search_path = public as $$
  select e.id, e.perfil_id,
         trim(e.primer_nombre || coalesce(' ' || e.otros_nombres, '') || ' ' || e.primer_apellido || coalesce(' ' || e.segundo_apellido, '')),
         e.tipo_documento, e.numero_documento, e.cargo, e.area, e.estado_laboral::text, e.fecha_ingreso, e.fecha_retiro, e.tipo_contrato,
         e.fecha_nacimiento, e.rh, e.eps, e.afp, e.arl, e.caja_compensacion, e.contacto_emergencia, e.telefono_emergencia,
         e.telefono, e.talla_camisa, e.talla_pantalon, e.talla_botas
  from empleados e
  where fn_persona_sst_ve()
  order by e.estado_laboral = 'retirado', 3;
$$;

-- Nombre de los contratistas (sin tarifas ni cuentas), para quien ve el personal.
create or replace function public.fn_sst_contratistas()
returns table (id uuid, nombre text, activo boolean)
language sql stable security definer set search_path = public as $$
  select c.id, c.nombre, c.activo from contratistas c where fn_persona_sst_ve() order by c.nombre;
$$;

-- ============================================================ 2) trabajadores de contratistas
create table if not exists public.contratista_trabajadores (
  id uuid primary key default gen_random_uuid(),
  contratista_id uuid not null references public.contratistas (id) on delete restrict,
  nombre text not null check (length(trim(nombre)) > 0),
  tipo_documento text not null default 'CC' check (tipo_documento in ('CC', 'CE', 'PA', 'PPT', 'TI')),
  numero_documento text not null check (length(trim(numero_documento)) > 0),
  cargo text,
  telefono text,
  contacto_emergencia text,
  telefono_emergencia text,
  rh text,
  activo boolean not null default true,
  creado_por uuid default auth.uid() references public.perfiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (contratista_id, tipo_documento, numero_documento)
);
drop trigger if exists trg_contratista_trabajadores_updated_at on public.contratista_trabajadores;
create trigger trg_contratista_trabajadores_updated_at before update on public.contratista_trabajadores
  for each row execute function extensions.moddatetime(updated_at);

-- ============================================================ 3) documentos de la persona
create table if not exists public.persona_documentos (
  id uuid primary key default gen_random_uuid(),
  empleado_id uuid references public.empleados (id) on delete restrict,
  contratista_trabajador_id uuid references public.contratista_trabajadores (id) on delete restrict,
  tipo text not null check (tipo in ('aptitud_ocupacional', 'certificado_alturas', 'capacitacion',
                                     'certificado_afiliacion', 'historia_clinica', 'otro')),
  nombre text,                                         -- cómo se muestra (opcional: si no, el tipo)
  entidad text,                                        -- IPS, centro de entrenamiento, EPS, ARL…
  fecha_documento date,
  vigente_desde date,
  vence_en date,                                       -- vencimiento o próximo examen
  -- Aptitud (dato de gestión; NUNCA el diagnóstico)
  examen text check (examen in ('ingreso', 'periodico', 'retiro', 'post_incapacidad', 'reintegro', 'cambio_de_cargo')),
  resultado text check (resultado in ('apto', 'apto_con_restricciones', 'no_apto', 'aplazado')),
  enfasis text[] not null default '{}' check (enfasis <@ array['alturas', 'espacios_confinados', 'riesgo_electrico', 'conduccion']::text[]),
  recomendaciones text,
  custodia_ips text,                                   -- quién custodia la historia clínica
  -- Alturas
  nivel text check (nivel in ('basico_operativo', 'avanzado', 'coordinador', 'reentrenamiento', 'jefe_de_area')),
  -- Capacitación
  tema text,
  horas numeric(6,1) check (horas is null or horas > 0),
  -- Afiliación
  subsistema text check (subsistema in ('eps', 'afp', 'arl', 'ccf')),
  -- El archivo (opcional: se puede registrar la fecha mientras llega el escaneo)
  path text unique,
  nombre_archivo text,
  mime text,
  bytes bigint check (bytes is null or bytes > 0),
  sha256 text check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  reservado boolean not null default false,
  notas text,
  verificado_por uuid references public.perfiles (id),
  verificado_en timestamptz,
  subido_por uuid default auth.uid() references public.perfiles (id),
  subido_en timestamptz not null default now(),
  archivado boolean not null default false,
  archivado_en timestamptz,
  archivado_por uuid references public.perfiles (id),
  motivo_archivo text,
  updated_at timestamptz not null default now(),
  constraint persona_documentos_duenio check ((empleado_id is null) <> (contratista_trabajador_id is null)),
  constraint persona_documentos_vigencia check (vence_en is null or vigente_desde is null or vence_en >= vigente_desde),
  constraint persona_documentos_aptitud check (tipo <> 'aptitud_ocupacional' or (examen is not null and resultado is not null)),
  constraint persona_documentos_restricciones check (resultado is distinct from 'apto_con_restricciones' or length(trim(coalesce(recomendaciones, ''))) > 0),
  constraint persona_documentos_alturas check (tipo <> 'certificado_alturas' or nivel is not null),
  constraint persona_documentos_afiliacion check (tipo <> 'certificado_afiliacion' or subsistema is not null),
  constraint persona_documentos_capacitacion check (tipo <> 'capacitacion' or length(trim(coalesce(tema, ''))) > 0),
  constraint persona_documentos_archivo_completo check ((path is null) = (sha256 is null) and (path is null) = (mime is null)),
  constraint persona_documentos_ruta check (
    path is null
    or path like 'personas/' || coalesce('e-' || empleado_id::text, 'c-' || contratista_trabajador_id::text) || '/'
                 || case when reservado then 'reservado/' else '' end || '%'),
  constraint persona_documentos_archivado check (not archivado or length(trim(coalesce(motivo_archivo, ''))) > 0)
);
create index if not exists idx_persona_documentos_empleado on public.persona_documentos (empleado_id, tipo, vigente_desde desc);
create index if not exists idx_persona_documentos_contratista on public.persona_documentos (contratista_trabajador_id, tipo, vigente_desde desc);
create index if not exists idx_persona_documentos_vence on public.persona_documentos (vence_en) where not archivado;
drop trigger if exists trg_persona_documentos_updated_at on public.persona_documentos;
create trigger trg_persona_documentos_updated_at before update on public.persona_documentos
  for each row execute function extensions.moddatetime(updated_at);

-- Reglas (NO definer: current_user es quien llama).
create or replace function public.fn_persona_documentos_reglas()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user in ('postgres', 'supabase_admin') then
    return coalesce(new, old);
  end if;
  if tg_op = 'DELETE' then
    raise exception 'Un documento de la persona no se borra: se archiva con motivo.';
  end if;
  -- La historia clínica es reservada siempre: no hay forma de subirla "abierta".
  if new.tipo = 'historia_clinica' then
    new.reservado := true;
  end if;
  if tg_op = 'INSERT' then
    new.subido_por := auth.uid();
    new.subido_en := now();
    new.verificado_por := null; new.verificado_en := null;
    new.archivado := false; new.archivado_en := null; new.archivado_por := null; new.motivo_archivo := null;
    return new;
  end if;
  -- UPDATE: lo registrado no se cambia (se registra otro y se archiva este). Solo verificar y archivar.
  if (new.empleado_id, new.contratista_trabajador_id, new.tipo, new.entidad, new.fecha_documento, new.vigente_desde, new.vence_en,
      new.examen, new.resultado, new.enfasis, new.recomendaciones, new.custodia_ips, new.nivel, new.tema, new.horas, new.subsistema,
      new.path, new.mime, new.bytes, new.sha256, new.reservado, new.subido_por, new.subido_en)
     is distinct from
     (old.empleado_id, old.contratista_trabajador_id, old.tipo, old.entidad, old.fecha_documento, old.vigente_desde, old.vence_en,
      old.examen, old.resultado, old.enfasis, old.recomendaciones, old.custodia_ips, old.nivel, old.tema, old.horas, old.subsistema,
      old.path, old.mime, old.bytes, old.sha256, old.reservado, old.subido_por, old.subido_en) then
    raise exception 'Lo registrado no se cambia: registra uno nuevo y archiva este con el motivo.';
  end if;
  if new.verificado_por is distinct from old.verificado_por or new.verificado_en is distinct from old.verificado_en then
    if not fn_tiene_permiso('sgsst', 'trabajar') then
      raise exception 'Verificar un documento es de SG-SST.';
    end if;
    new.verificado_por := auth.uid();
    new.verificado_en := now();
  end if;
  if new.archivado is distinct from old.archivado then
    if not new.archivado then
      raise exception 'Un documento archivado no vuelve: registra uno nuevo.';
    end if;
    if length(trim(coalesce(new.motivo_archivo, ''))) = 0 then
      raise exception 'Escribe por qué se archiva.';
    end if;
    new.archivado_en := now();
    new.archivado_por := auth.uid();
  end if;
  return new;
end;
$$;
drop trigger if exists trg_persona_documentos_reglas on public.persona_documentos;
create trigger trg_persona_documentos_reglas before insert or update or delete on public.persona_documentos
  for each row execute function public.fn_persona_documentos_reglas();

-- ============================================================ 4) EPP: lo que completa SG-SST
create table if not exists public.epp_seguimiento (
  entrega_id uuid primary key references public.dotacion_entregas (id) on delete restrict,
  capacitacion_uso_en date,                            -- cuándo se le enseñó a usarlo
  vida_util_meses int check (vida_util_meses is null or vida_util_meses > 0),
  reponer_en date,                                     -- cuándo hay que reponerlo
  notas text,
  actualizado_por uuid default auth.uid() references public.perfiles (id),
  actualizado_en timestamptz not null default now()
);
create table if not exists public.epp_inspecciones (
  id uuid primary key default gen_random_uuid(),
  entrega_id uuid not null references public.dotacion_entregas (id) on delete restrict,
  fecha date not null default ((now() at time zone 'America/Bogota')::date),
  estado text not null check (estado in ('bueno', 'regular', 'malo', 'para_reponer')),
  en_uso boolean,                                      -- ¿lo estaba usando?
  observacion text,
  inspeccionado_por uuid default auth.uid() references public.perfiles (id),
  registrado_en timestamptz not null default now()
);
create index if not exists idx_epp_inspecciones on public.epp_inspecciones (entrega_id, fecha desc);

create or replace function public.fn_epp_sst_reglas()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user in ('postgres', 'supabase_admin') then
    return coalesce(new, old);
  end if;
  if tg_op = 'DELETE' then
    raise exception 'El seguimiento del EPP no se borra.';
  end if;
  if tg_table_name = 'epp_inspecciones' then
    if tg_op = 'UPDATE' then
      raise exception 'Una inspección no se cambia: registra otra.';
    end if;
    new.inspeccionado_por := auth.uid();
    new.registrado_en := now();
  else
    new.actualizado_por := auth.uid();
    new.actualizado_en := now();
  end if;
  return new;
end;
$$;
drop trigger if exists trg_epp_seguimiento_reglas on public.epp_seguimiento;
create trigger trg_epp_seguimiento_reglas before insert or update or delete on public.epp_seguimiento
  for each row execute function public.fn_epp_sst_reglas();
drop trigger if exists trg_epp_inspecciones_reglas on public.epp_inspecciones;
create trigger trg_epp_inspecciones_reglas before insert or update or delete on public.epp_inspecciones
  for each row execute function public.fn_epp_sst_reglas();

-- Es una entrega de EPP (para las políticas de las tablas de SG-SST).
create or replace function public.fn_es_entrega_epp(p_entrega_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from dotacion_entregas d where d.id = p_entrega_id and d.categoria = 'epp');
$$;

-- ============================================================ 5) RLS
alter table public.contratista_trabajadores enable row level security;
alter table public.persona_documentos enable row level security;
alter table public.epp_seguimiento enable row level security;
alter table public.epp_inspecciones enable row level security;
revoke all on table public.contratista_trabajadores, public.persona_documentos, public.epp_seguimiento, public.epp_inspecciones from anon;
revoke truncate, trigger, references, delete on table public.contratista_trabajadores, public.persona_documentos,
  public.epp_seguimiento, public.epp_inspecciones from authenticated;

drop policy if exists contratista_trabajadores_select on public.contratista_trabajadores;
create policy contratista_trabajadores_select on public.contratista_trabajadores for select to authenticated
  using (fn_persona_sst_ve() or fn_tiene_permiso('administrativo', 'consultar'));
drop policy if exists contratista_trabajadores_insert on public.contratista_trabajadores;
create policy contratista_trabajadores_insert on public.contratista_trabajadores for insert to authenticated
  with check (fn_tiene_permiso('sgsst', 'trabajar') or fn_tiene_permiso('administrativo', 'trabajar'));
drop policy if exists contratista_trabajadores_update on public.contratista_trabajadores;
create policy contratista_trabajadores_update on public.contratista_trabajadores for update to authenticated
  using (fn_tiene_permiso('sgsst', 'trabajar') or fn_tiene_permiso('administrativo', 'trabajar'))
  with check (fn_tiene_permiso('sgsst', 'trabajar') or fn_tiene_permiso('administrativo', 'trabajar'));

-- Lo reservado (historia clínica), solo con SG-SST y datos sensibles.
drop policy if exists persona_documentos_select on public.persona_documentos;
create policy persona_documentos_select on public.persona_documentos for select to authenticated
  using (fn_persona_sst_ve() and (not reservado or (fn_tiene_permiso('sgsst', 'consultar') and fn_ve_datos_sensibles('sgsst'))));
drop policy if exists persona_documentos_insert on public.persona_documentos;
create policy persona_documentos_insert on public.persona_documentos for insert to authenticated
  with check (fn_persona_doc_puede(tipo)
              and (tipo <> 'historia_clinica' or fn_ve_datos_sensibles('sgsst')));
drop policy if exists persona_documentos_update on public.persona_documentos;
create policy persona_documentos_update on public.persona_documentos for update to authenticated
  using (fn_persona_doc_puede(tipo) and (not reservado or fn_ve_datos_sensibles('sgsst')))
  with check (fn_persona_doc_puede(tipo));

drop policy if exists epp_seguimiento_select on public.epp_seguimiento;
create policy epp_seguimiento_select on public.epp_seguimiento for select to authenticated using (fn_persona_sst_ve());
drop policy if exists epp_seguimiento_insert on public.epp_seguimiento;
create policy epp_seguimiento_insert on public.epp_seguimiento for insert to authenticated
  with check (fn_tiene_permiso('sgsst', 'trabajar') and fn_es_entrega_epp(entrega_id));
drop policy if exists epp_seguimiento_update on public.epp_seguimiento;
create policy epp_seguimiento_update on public.epp_seguimiento for update to authenticated
  using (fn_tiene_permiso('sgsst', 'trabajar')) with check (fn_tiene_permiso('sgsst', 'trabajar'));
drop policy if exists epp_inspecciones_select on public.epp_inspecciones;
create policy epp_inspecciones_select on public.epp_inspecciones for select to authenticated using (fn_persona_sst_ve());
drop policy if exists epp_inspecciones_insert on public.epp_inspecciones;
create policy epp_inspecciones_insert on public.epp_inspecciones for insert to authenticated
  with check (fn_tiene_permiso('sgsst', 'trabajar') and fn_es_entrega_epp(entrega_id));

-- Las entregas de EPP (y SOLO de EPP) para SG-SST: verlas y registrarlas. Se SUMAN a las de RRHH.
drop policy if exists dotacion_entregas_select_sgsst_epp on public.dotacion_entregas;
create policy dotacion_entregas_select_sgsst_epp on public.dotacion_entregas for select to authenticated
  using (categoria = 'epp' and fn_tiene_permiso('sgsst', 'consultar'));
drop policy if exists dotacion_entregas_insert_sgsst_epp on public.dotacion_entregas;
create policy dotacion_entregas_insert_sgsst_epp on public.dotacion_entregas for insert to authenticated
  with check (categoria = 'epp' and herramienta_id is null and fn_tiene_permiso('sgsst', 'trabajar'));

-- ============================================================ 6) archivos (bucket privado sst-personal)
-- personas/e-{empleado}/… o personas/c-{trabajador}/…; lo reservado en …/reservado/.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('sst-personal', 'sst-personal', false, 15728640,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do update set
  public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.fn_sst_personal_archivo(p_nombre text, p_accion text)
returns boolean language sql stable security definer set search_path = public as $$
  select (storage.foldername(p_nombre))[1] = 'personas'
     and case p_accion
       when 'ver' then exists (
         select 1 from persona_documentos d
         where d.path = p_nombre and fn_persona_sst_ve()
           and (not d.reservado or (fn_tiene_permiso('sgsst', 'consultar') and fn_ve_datos_sensibles('sgsst'))))
       when 'subir' then
         (fn_tiene_permiso('sgsst', 'trabajar') or fn_tiene_permiso('rrhh', 'trabajar'))
         and ((storage.foldername(p_nombre))[3] is distinct from 'reservado' or fn_ve_datos_sensibles('sgsst'))
         and (exists (select 1 from empleados e where 'e-' || e.id::text = (storage.foldername(p_nombre))[2])
              or exists (select 1 from contratista_trabajadores t where 'c-' || t.id::text = (storage.foldername(p_nombre))[2]))
       else false
     end;
$$;
drop policy if exists sst_personal_select on storage.objects;
create policy sst_personal_select on storage.objects for select to authenticated
  using (bucket_id = 'sst-personal' and fn_sst_personal_archivo(name, 'ver'));
drop policy if exists sst_personal_insert on storage.objects;
create policy sst_personal_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'sst-personal' and fn_sst_personal_archivo(name, 'subir'));
-- Sin reemplazar ni borrar.

-- ============================================================ 7) privilegios de las funciones
revoke all on function public.fn_persona_sst_ve() from public, anon;
revoke all on function public.fn_persona_doc_puede(text) from public, anon;
revoke all on function public.fn_sst_personal_ficha() from public, anon;
revoke all on function public.fn_sst_contratistas() from public, anon;
revoke all on function public.fn_es_entrega_epp(uuid) from public, anon;
revoke all on function public.fn_sst_personal_archivo(text, text) from public, anon;
grant execute on function public.fn_persona_sst_ve() to authenticated, service_role;
grant execute on function public.fn_persona_doc_puede(text) to authenticated, service_role;
grant execute on function public.fn_sst_personal_ficha() to authenticated, service_role;
grant execute on function public.fn_sst_contratistas() to authenticated, service_role;
grant execute on function public.fn_es_entrega_epp(uuid) to authenticated, service_role;
grant execute on function public.fn_sst_personal_archivo(text, text) to authenticated;
revoke all on function public.fn_persona_documentos_reglas() from public, anon, authenticated;
revoke all on function public.fn_epp_sst_reglas() from public, anon, authenticated;
