-- Portal del cliente: el cliente entra con su usuario y ve SOLO lo que se le asignó.
--
-- Principio de diseño: el cliente NO recibe permiso sobre ningún módulo del ERP.
-- No "entra a Proyectos" ni "entra a Financiero". Alguien de adentro PUBLICA un
-- documento hacia el portal, y eso es lo único que el cliente alcanza a ver.
-- Nada se expone por defecto: si no está publicado, no existe para el cliente.
--
-- Lo que el cliente puede hacer, y nada más:
--   * leer y descargar los documentos publicados de SUS proyectos;
--   * ver la ficha técnica del personal que trabaja en SUS instalaciones
--     (nombre, cédula, cargo, cursos y planillas: nunca datos de salud);
--   * firmar las actas donde le corresponde firmar (rol sst_cliente).
-- No crea, no edita, no borra, no ve costos, márgenes, AIU ni otros clientes.

-- ============================================================ 1) quién es un cliente

create table if not exists public.cliente_usuarios (
  perfil_id   uuid primary key references public.perfiles(id) on delete cascade,
  cliente_id  uuid not null references public.clientes(id) on delete restrict,
  cargo       text,
  activo      boolean not null default true,
  creado_por  uuid not null default auth.uid() references auth.users(id),
  creado_en   timestamptz not null default now(),
  desactivado_en  timestamptz,
  desactivado_por uuid references auth.users(id),
  motivo_desactivacion text,
  constraint cliente_usuarios_desactivado
    check (activo or length(trim(coalesce(motivo_desactivacion,''))) > 0)
);

create index if not exists cliente_usuarios_cliente_ix on public.cliente_usuarios (cliente_id);

-- El cliente al que pertenece quien pregunta. NULL si no es un usuario de cliente.
create or replace function public.fn_cliente_actual()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select cu.cliente_id from public.cliente_usuarios cu
  where cu.perfil_id = auth.uid() and cu.activo
  limit 1;
$$;

-- ¿Este proyecto es de mi cliente?
create or replace function public.fn_cliente_ve_proyecto(p_proyecto uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.proyectos p
    where p.id = p_proyecto
      and p.cliente_id = public.fn_cliente_actual()
      and public.fn_cliente_actual() is not null
  );
$$;

-- ============================================================ 2) personal en obra

create table if not exists public.proyecto_personal (
  id          uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.proyectos(id) on delete cascade,
  empleado_id uuid not null references public.empleados(id) on delete restrict,
  rol_en_obra text,
  desde       date not null default (now() at time zone 'America/Bogota')::date,
  hasta       date,
  asignado_por uuid not null default auth.uid() references auth.users(id),
  asignado_en  timestamptz not null default now(),
  constraint proyecto_personal_fechas check (hasta is null or hasta >= desde)
);

create unique index if not exists proyecto_personal_uk
  on public.proyecto_personal (proyecto_id, empleado_id, desde);
create index if not exists proyecto_personal_proyecto_ix
  on public.proyecto_personal (proyecto_id);

-- ============================================================ 3) documentos publicados

create table if not exists public.cliente_portal_documentos (
  id            uuid primary key default gen_random_uuid(),
  proyecto_id   uuid not null references public.proyectos(id) on delete cascade,
  categoria     text not null,
  titulo        text not null,
  descripcion   text,
  -- El documento vive donde ya vivía. Aquí solo se apunta a él (una fuente, muchas vistas).
  proyecto_documento_id uuid references public.proyecto_documentos(id) on delete cascade,
  formato_id            uuid references public.sst_formatos(id) on delete cascade,
  bucket        text,
  path          text,
  mime          text,
  bytes         bigint,
  publicado_por uuid not null default auth.uid() references auth.users(id),
  publicado_en  timestamptz not null default now(),
  retirado_por  uuid references auth.users(id),
  retirado_en   timestamptz,
  motivo_retiro text,
  constraint cliente_portal_documentos_titulo check (length(trim(titulo)) > 0),
  constraint cliente_portal_documentos_categoria check (categoria in (
    'cotizacion','contrato','poliza','pago_poliza','cronograma',
    'acta','informe','plano','manual','factura','otro')),
  -- Exactamente una fuente: un documento de proyecto, un formato firmado, o un archivo suelto.
  constraint cliente_portal_documentos_fuente check (
    (proyecto_documento_id is not null)::int
  + (formato_id is not null)::int
  + (path is not null)::int = 1
  ),
  constraint cliente_portal_documentos_archivo check (
    path is null or (bucket is not null and mime is not null)
  ),
  constraint cliente_portal_documentos_retiro check (
    retirado_en is null or length(trim(coalesce(motivo_retiro,''))) > 0
  )
);

create index if not exists cliente_portal_documentos_proyecto_ix
  on public.cliente_portal_documentos (proyecto_id) where retirado_en is null;

-- ============================================================ 4) lo que ve el cliente

-- Las cuatro vistas del cliente son SECURITY DEFINER a propósito (no invoker).
-- Si fueran invoker habría que darle al cliente permiso de lectura sobre `proyectos`,
-- y esa tabla tiene `descripcion`, donde hoy vive el desglose de costos, el AIU, la
-- utilidad y hasta el número de cuenta bancaria. Con definer, el cliente nunca toca
-- la tabla: solo recibe las columnas de abajo, ya filtradas por su propio cliente_id.

-- Sus proyectos. Sin costos, sin márgenes, sin descripción interna.
create or replace view public.v_cliente_mis_proyectos as
select
  p.id,
  p.codigo,
  p.nombre,
  p.estado,
  p.tipo_contrato,
  p.fecha_inicio,
  p.fecha_fin_estimada,
  p.contrato_firmado,
  (select count(*) from public.cliente_portal_documentos d
    where d.proyecto_id = p.id and d.retirado_en is null) as documentos
from public.proyectos p
where p.cliente_id = public.fn_cliente_actual()
  and public.fn_cliente_actual() is not null;

-- Los documentos que alguien le publicó. Nada más.
create or replace view public.v_cliente_documentos as
select
  d.id,
  d.proyecto_id,
  p.codigo as proyecto_codigo,
  p.nombre as proyecto_nombre,
  d.categoria,
  d.titulo,
  d.descripcion,
  coalesce(d.bucket, case when d.proyecto_documento_id is not null then 'documentos-proyectos'
                          when d.formato_id is not null then 'sgsst' end) as bucket,
  coalesce(d.path, pd.path) as path,
  coalesce(d.mime, pd.mime) as mime,
  coalesce(d.bytes, pd.bytes) as bytes,
  d.formato_id,
  d.publicado_en
from public.cliente_portal_documentos d
join public.proyectos p on p.id = d.proyecto_id
left join public.proyecto_documentos pd on pd.id = d.proyecto_documento_id
where d.retirado_en is null
  and p.cliente_id = public.fn_cliente_actual()
  and public.fn_cliente_actual() is not null;

-- Ficha técnica del personal que trabaja en sus instalaciones.
-- SOLO datos no sensibles: nombre, cédula, cargo y formación.
-- Nunca historia clínica, nunca aptitud ocupacional, nunca salario ni datos de contacto.
create or replace view public.v_cliente_personal as
select
  pp.proyecto_id,
  e.id as empleado_id,
  trim(concat_ws(' ', e.primer_nombre, e.otros_nombres, e.primer_apellido, e.segundo_apellido)) as nombre,
  e.tipo_documento,
  e.numero_documento,
  coalesce(pp.rol_en_obra, e.cargo) as cargo,
  pp.desde,
  pp.hasta,
  (select jsonb_agg(jsonb_build_object(
            'tipo', pdoc.tipo,
            'nombre', pdoc.nombre,
            'nivel', pdoc.nivel,
            'tema', pdoc.tema,
            'horas', pdoc.horas,
            'entidad', pdoc.entidad,
            'fecha', pdoc.fecha_documento,
            'vence_en', pdoc.vence_en)
          order by pdoc.fecha_documento desc)
     from public.persona_documentos pdoc
    where pdoc.empleado_id = e.id
      and not pdoc.archivado
      and not pdoc.reservado
      and pdoc.tipo in ('certificado_alturas','capacitacion','certificado_afiliacion')
  ) as formacion
from public.proyecto_personal pp
join public.proyectos p on p.id = pp.proyecto_id
join public.empleados e on e.id = pp.empleado_id
where p.cliente_id = public.fn_cliente_actual()
  and public.fn_cliente_actual() is not null;

-- Las actas donde le toca firmar a él.
create or replace view public.v_cliente_por_firmar as
select
  f.id as formato_id,
  pl.codigo,
  pl.nombre as formato,
  f.fecha,
  f.proyecto_id,
  p.codigo as proyecto_codigo,
  f.estado,
  exists (select 1 from public.sst_formato_firmas s
           where s.formato_id = f.id and s.rol = 'sst_cliente') as ya_firmado
from public.sst_formatos f
join public.sst_plantillas pl on pl.id = f.plantilla_id
join public.proyectos p on p.id = f.proyecto_id
where f.estado = 'borrador'
  and p.cliente_id = public.fn_cliente_actual()
  and public.fn_cliente_actual() is not null
  and pl.firmas @> '[{"rol":"sst_cliente"}]'::jsonb;

-- ============================================================ 5) permisos

alter table public.cliente_usuarios            enable row level security;
alter table public.proyecto_personal           enable row level security;
alter table public.cliente_portal_documentos   enable row level security;

revoke all on public.cliente_usuarios          from public, anon, authenticated;
revoke all on public.proyecto_personal         from public, anon, authenticated;
revoke all on public.cliente_portal_documentos from public, anon, authenticated;

-- Los grants son a nivel de tabla; lo que de verdad restringe es RLS. Abajo NO hay
-- ninguna política que le permita a un usuario de cliente escribir en estas tablas:
-- publicar documentos y asignar personal exige permiso de Administrativo o Configuración.
grant select on public.cliente_usuarios          to authenticated;
grant select on public.proyecto_personal         to authenticated;
grant select on public.cliente_portal_documentos to authenticated;
grant insert, update, delete on public.cliente_usuarios          to authenticated;
grant insert, update, delete on public.proyecto_personal         to authenticated;
grant insert, update, delete on public.cliente_portal_documentos to authenticated;

grant select on public.v_cliente_mis_proyectos to authenticated;
grant select on public.v_cliente_documentos    to authenticated;
grant select on public.v_cliente_personal      to authenticated;
grant select on public.v_cliente_por_firmar    to authenticated;

-- cliente_usuarios: el cliente se ve a sí mismo; la gestión la hace Configuración.
drop policy if exists cliente_usuarios_propio on public.cliente_usuarios;
create policy cliente_usuarios_propio on public.cliente_usuarios
  for select to authenticated using (perfil_id = auth.uid());

drop policy if exists cliente_usuarios_gestion on public.cliente_usuarios;
create policy cliente_usuarios_gestion on public.cliente_usuarios
  for select to authenticated using (public.fn_tiene_permiso('configuracion','consultar'));

drop policy if exists cliente_usuarios_admin_ins on public.cliente_usuarios;
create policy cliente_usuarios_admin_ins on public.cliente_usuarios
  for insert to authenticated with check (public.fn_tiene_permiso('configuracion','responsable'));

drop policy if exists cliente_usuarios_admin_upd on public.cliente_usuarios;
create policy cliente_usuarios_admin_upd on public.cliente_usuarios
  for update to authenticated
  using (public.fn_tiene_permiso('configuracion','responsable'))
  with check (public.fn_tiene_permiso('configuracion','responsable'));

drop policy if exists cliente_usuarios_admin_del on public.cliente_usuarios;
create policy cliente_usuarios_admin_del on public.cliente_usuarios
  for delete to authenticated using (public.fn_tiene_permiso('configuracion','responsable'));

-- proyecto_personal: adentro lo gestiona quien tiene el módulo Proyectos; el cliente solo lee el suyo.
drop policy if exists proyecto_personal_interno on public.proyecto_personal;
create policy proyecto_personal_interno on public.proyecto_personal
  for select to authenticated using (public.fn_tiene_permiso('proyectos','consultar'));

drop policy if exists proyecto_personal_cliente on public.proyecto_personal;
create policy proyecto_personal_cliente on public.proyecto_personal
  for select to authenticated using (public.fn_cliente_ve_proyecto(proyecto_id));

drop policy if exists proyecto_personal_ins on public.proyecto_personal;
create policy proyecto_personal_ins on public.proyecto_personal
  for insert to authenticated with check (public.fn_tiene_permiso('proyectos','trabajar'));

drop policy if exists proyecto_personal_upd on public.proyecto_personal;
create policy proyecto_personal_upd on public.proyecto_personal
  for update to authenticated
  using (public.fn_tiene_permiso('proyectos','trabajar'))
  with check (public.fn_tiene_permiso('proyectos','trabajar'));

drop policy if exists proyecto_personal_del on public.proyecto_personal;
create policy proyecto_personal_del on public.proyecto_personal
  for delete to authenticated using (public.fn_tiene_permiso('proyectos','trabajar'));

-- cliente_portal_documentos: publicar es un acto deliberado de alguien de adentro.
drop policy if exists portal_docs_interno on public.cliente_portal_documentos;
create policy portal_docs_interno on public.cliente_portal_documentos
  for select to authenticated using (public.fn_tiene_permiso('proyectos','consultar'));

drop policy if exists portal_docs_cliente on public.cliente_portal_documentos;
create policy portal_docs_cliente on public.cliente_portal_documentos
  for select to authenticated
  using (retirado_en is null and public.fn_cliente_ve_proyecto(proyecto_id));

drop policy if exists portal_docs_ins on public.cliente_portal_documentos;
create policy portal_docs_ins on public.cliente_portal_documentos
  for insert to authenticated with check (public.fn_tiene_permiso('proyectos','trabajar'));

drop policy if exists portal_docs_upd on public.cliente_portal_documentos;
create policy portal_docs_upd on public.cliente_portal_documentos
  for update to authenticated
  using (public.fn_tiene_permiso('proyectos','trabajar'))
  with check (public.fn_tiene_permiso('proyectos','trabajar'));

-- OJO: aquí NO se crea ninguna política de lectura sobre `proyectos` para el cliente.
-- Esa tabla tiene `descripcion` con costos, AIU, utilidad y número de cuenta. El cliente
-- llega a sus proyectos únicamente por la vista v_cliente_mis_proyectos (definer).

drop policy if exists sst_formatos_select_cliente on public.sst_formatos;
create policy sst_formatos_select_cliente on public.sst_formatos
  for select to authenticated
  using (public.fn_cliente_ve_proyecto(proyecto_id));

drop policy if exists sst_plantillas_select_cliente on public.sst_plantillas;
create policy sst_plantillas_select_cliente on public.sst_plantillas
  for select to authenticated
  using (exists (select 1 from public.sst_formatos f
                 where f.plantilla_id = sst_plantillas.id
                   and public.fn_cliente_ve_proyecto(f.proyecto_id)));

drop policy if exists sst_formato_firmas_select_cliente on public.sst_formato_firmas;
create policy sst_formato_firmas_select_cliente on public.sst_formato_firmas
  for select to authenticated
  using (exists (select 1 from public.sst_formatos f
                 where f.id = sst_formato_firmas.formato_id
                   and public.fn_cliente_ve_proyecto(f.proyecto_id)));

-- Firmar: solo como contratante, solo en sus actas, solo en borrador.
drop policy if exists sst_formato_firmas_insert_cliente on public.sst_formato_firmas;
create policy sst_formato_firmas_insert_cliente on public.sst_formato_firmas
  for insert to authenticated
  with check (
    rol = 'sst_cliente'
    and exists (select 1 from public.sst_formatos f
                where f.id = formato_id
                  and f.estado = 'borrador'
                  and public.fn_cliente_ve_proyecto(f.proyecto_id))
  );

-- Y la regla de firma lo deja pasar por ese camino.
create or replace function public.fn_sst_firma_reglas()
returns trigger
language plpgsql
set search_path = public
as $fn$
declare
  v_falta text[];
  v_estado text;
  v_ambito text;
  v_previa record;
  v_proyecto uuid;
  v_es_cliente boolean := false;
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

  select f.proyecto_id into v_proyecto from sst_formatos f where f.id = new.formato_id;
  v_es_cliente := v_proyecto is not null and fn_cliente_ve_proyecto(v_proyecto);

  -- Camino 1: permiso sobre el módulo. Camino 2: convocado. Camino 3: es el contratante.
  if not fn_plantillas_permiso(v_ambito, 'trabajar')
     and not fn_sst_convocado(new.formato_id)
     and not v_es_cliente then
    raise exception 'No tienes permiso para firmar formatos de %.', case v_ambito when 'proyectos' then 'Proyectos' else 'SG-SST' end;
  end if;
  if v_estado <> 'borrador' then
    raise exception 'El formato ya está cerrado: no recibe más firmas.';
  end if;

  -- El cliente solo firma como contratante.
  if v_es_cliente and not fn_plantillas_permiso(v_ambito, 'trabajar') and new.rol <> 'sst_cliente' then
    raise exception 'Solo puedes firmar como contratante.';
  end if;

  -- El convocado firma por sí mismo, como participante.
  if not fn_plantillas_permiso(v_ambito, 'trabajar') and not v_es_cliente then
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
$fn$;

-- Storage: el cliente descarga únicamente los archivos que le fueron publicados.
drop policy if exists portal_cliente_descarga on storage.objects;
create policy portal_cliente_descarga on storage.objects
  for select to authenticated
  using (
    public.fn_cliente_actual() is not null
    and exists (
      select 1
      from public.cliente_portal_documentos d
      join public.proyectos p on p.id = d.proyecto_id
      left join public.proyecto_documentos pd on pd.id = d.proyecto_documento_id
      where d.retirado_en is null
        and p.cliente_id = public.fn_cliente_actual()
        and storage.objects.name = coalesce(d.path, pd.path)
        and storage.objects.bucket_id = coalesce(d.bucket,
              case when d.proyecto_documento_id is not null then 'documentos-proyectos'
                   when d.formato_id is not null then 'sgsst' end)
    )
  );

-- ============================================================ 6) el módulo del cliente

insert into public.modulos (id, nombre, orden)
values ('cliente', 'Portal del cliente', 14)
on conflict (id) do nothing;

insert into public.modulo_secciones (modulo_id, seccion_id, nombre, href, orden) values
  ('cliente','proyectos','Mis proyectos','/cliente/proyectos',1),
  ('cliente','documentos','Documentos del proyecto','/cliente/documentos',2),
  ('cliente','personal','Personal en obra','/cliente/personal',3),
  ('cliente','firmas','Documentos por firmar','/cliente/firmas',4)
on conflict (modulo_id, seccion_id) do nothing;

insert into public.roles (nombre)
select 'Cliente' where not exists (select 1 from public.roles where nombre = 'Cliente');

insert into public.permisos_rol (rol_id, modulo_id, nivel)
select r.id, 'cliente', 'consultar'::nivel_permiso
from public.roles r where r.nombre = 'Cliente'
on conflict do nothing;

revoke all on function public.fn_cliente_actual()        from public, anon;
revoke all on function public.fn_cliente_ve_proyecto(uuid) from public, anon;
grant execute on function public.fn_cliente_actual()        to authenticated;
grant execute on function public.fn_cliente_ve_proyecto(uuid) to authenticated;

comment on table public.cliente_portal_documentos is
  'Documentos PUBLICADOS hacia el portal del cliente. Nada se expone por defecto: si no hay fila aquí, el cliente no lo ve.';
comment on view public.v_cliente_personal is
  'Ficha técnica del personal en obra para el cliente: nombre, cédula, cargo y formación. Excluye historia clínica y aptitud ocupacional.';
