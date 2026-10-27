-- Respaldo de los ARCHIVOS del ERP en Google Drive (2026-10-27). NO respalda la base de datos.
--
-- Lo hace la Edge Function "respaldar-drive" (supabase/functions/respaldar-drive) con un cron;
-- no depende de ningún PC ni de n8n. Sube a la carpeta "Respaldo ERP Servielectro" del Drive de
-- Jhojan (OAuth con su cuenta, scope drive.file: solo ve lo que ella misma crea). Detalle y
-- puesta en marcha: docs/respaldo-drive.md.
--
-- Una sola tabla para TODOS los buckets (respaldo_drive_archivos): por cada archivo de Storage,
-- el id de su copia en Drive, el MD5 de lo que se subió, el MD5 que Drive dice tener y CUÁNDO se
-- verificó que coinciden. "Verificado" = Drive confirmó el mismo MD5 y el mismo tamaño que los
-- bytes que se bajaron de Storage. Una copia que desaparece de Drive (borrada o en la papelera)
-- se detecta en la reverificación periódica, queda "perdida" y se vuelve a subir.
--
-- La copia del audio de reuniones (columnas de la migración 89) se escribe DESDE aquí: cuando un
-- archivo del bucket "reuniones" queda verificado, la función anota también su id, MD5 y fecha
-- en la reunión. La regla dura sigue siendo la de la 89: ningún audio descartado sin copia
-- verificada. Esta tabla es el registro completo; las columnas de la reunión, la prueba puntual.
--
-- Turno: respaldo_drive_corridas. Una corrida a la vez (si otra sigue viva, la nueva no arranca;
-- si una se murió sin cerrar, a los 15 minutos se le quita el turno). Si la autorización de
-- Google se cae (refresh token vencido o revocado) o una corrida termina con errores, se avisa al
-- responsable de Configuración (notificación, y al celular si tiene activado el push). Un
-- respaldo que se cae solo y en silencio es el riesgo que esto viene a cerrar.
--
-- Todo lo escribe la función (service_role). Desde la app solo se LEE, con Configuración
-- "consultar". Nada se borra: un archivo que se borra de Storage conserva su copia en Drive.
--
-- Requiere la 76 (notificaciones) y la 89 (columnas de reuniones). Idempotente.
-- Verificación: supabase/verificaciones/20261119000091_verificar.sql
-- Rollback:     supabase/rollbacks/20261119000091_respaldo_drive_down.sql

-- ============================================================ 1) tablas
create table if not exists public.respaldo_drive_archivos (
  id uuid primary key default gen_random_uuid(),
  bucket text not null,
  ruta text not null,
  origen_bytes bigint,
  origen_actualizado timestamptz,         -- updated_at del objeto en Storage cuando se respaldó
  origen_md5 text check (origen_md5 is null or origen_md5 ~ '^[0-9a-f]{32}$'),
  drive_file_id text,
  drive_md5 text check (drive_md5 is null or drive_md5 ~ '^[0-9a-f]{32}$'),
  subido_en timestamptz,
  verificado_en timestamptz,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'respaldado', 'error', 'perdido')),
  intentos int not null default 0,
  ultimo_error text,
  versiones_anteriores jsonb not null default '[]'::jsonb,   -- copias previas si el objeto cambió
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique (bucket, ruta),
  constraint respaldo_verificado check (
    estado <> 'respaldado'
    or (drive_file_id is not null and origen_md5 is not null and drive_md5 = origen_md5 and verificado_en is not null))
);
create index if not exists idx_respaldo_estado on public.respaldo_drive_archivos (estado, intentos);
create index if not exists idx_respaldo_verificado on public.respaldo_drive_archivos (verificado_en) where estado = 'respaldado';

-- La carpeta de Drive de cada bucket y subcarpeta (para no crearla dos veces).
create table if not exists public.respaldo_drive_carpetas (
  ruta text primary key,                  -- "reuniones" o "reuniones/<id>"
  drive_id text not null,
  creada_en timestamptz not null default now()
);

create table if not exists public.respaldo_drive_corridas (
  id uuid primary key default gen_random_uuid(),
  iniciada_en timestamptz not null default now(),
  latido_en timestamptz not null default now(),   -- la función lo renueva mientras trabaja
  terminada_en timestamptz,
  resultado text check (resultado in ('ok', 'con_errores', 'autorizacion_vencida', 'fallo')),
  subidos int not null default 0,
  reverificados int not null default 0,
  perdidos int not null default 0,
  errores int not null default 0,
  pendientes_al_cerrar int,
  detalle text
);
create index if not exists idx_respaldo_corridas on public.respaldo_drive_corridas (iniciada_en desc);

-- ============================================================ 2) lo que falta respaldar
-- Objetos de Storage sin copia, con copia vieja (el objeto cambió), con error o perdidos. Los que
-- más fallaron, al final (un archivo roto no frena a los demás).
create or replace function public.fn_respaldo_pendientes(p_limite int)
returns table (bucket text, ruta text, bytes bigint, mime text, actualizado timestamptz)
language sql
stable
security definer
set search_path = public, storage
as $$
  select o.bucket_id, o.name, (o.metadata ->> 'size')::bigint, o.metadata ->> 'mimetype', o.updated_at
  from storage.objects o
  left join public.respaldo_drive_archivos r on r.bucket = o.bucket_id and r.ruta = o.name
  where o.name not like '%.emptyFolderPlaceholder'
    and (r.id is null
         or r.estado in ('pendiente', 'error', 'perdido')
         or (r.estado = 'respaldado' and o.updated_at > r.origen_actualizado))
  order by coalesce(r.intentos, 0), o.created_at
  limit greatest(1, least(p_limite, 500));
$$;

-- Turno: devuelve el id de una corrida nueva, o null si hay otra viva (latido de menos de 15 min).
create or replace function public.fn_respaldo_tomar_turno()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  lock table respaldo_drive_corridas in share row exclusive mode;
  -- La que se murió sin cerrar, se cierra.
  update respaldo_drive_corridas set terminada_en = now(), resultado = 'fallo',
         detalle = coalesce(detalle || ' · ', '') || 'Sin latido por más de 15 minutos: se cerró sola.'
  where terminada_en is null and latido_en < now() - interval '15 minutes';
  if exists (select 1 from respaldo_drive_corridas where terminada_en is null) then
    return null;
  end if;
  insert into respaldo_drive_corridas default values returning id into v_id;
  return v_id;
end;
$$;

-- Resumen para la app (Configuración): cuántos en cada estado, la última corrida y la verificación
-- más vieja. Si "ultima_ok" se aleja, el respaldo no está corriendo.
create or replace view public.v_respaldo_drive_resumen
with (security_invoker = true) as
select
  (select count(*) from respaldo_drive_archivos where estado = 'respaldado') as respaldados,
  (select count(*) from respaldo_drive_archivos where estado = 'pendiente') as pendientes,
  (select count(*) from respaldo_drive_archivos where estado = 'error') as con_error,
  (select count(*) from respaldo_drive_archivos where estado = 'perdido') as perdidos,
  (select min(verificado_en) from respaldo_drive_archivos where estado = 'respaldado') as verificacion_mas_vieja,
  (select max(terminada_en) from respaldo_drive_corridas where resultado = 'ok') as ultima_ok,
  (select resultado from respaldo_drive_corridas where terminada_en is not null order by terminada_en desc limit 1) as ultimo_resultado;

-- ============================================================ 3) aviso cuando se cae
insert into public.notificacion_tipos (id, nombre, descripcion, para, por_defecto, orden) values
  ('respaldo_drive', 'Respaldo en Google Drive', 'El respaldo de archivos en Drive falló o perdió la autorización de Google.', 'aprobador', true, 60)
on conflict (id) do update set nombre = excluded.nombre, descripcion = excluded.descripcion;

create or replace function public.fn_respaldo_avisar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_titulo text;
begin
  if new.terminada_en is null or old.terminada_en is not null
     or new.resultado not in ('autorizacion_vencida', 'con_errores', 'fallo') then
    return null;
  end if;
  v_titulo := case new.resultado
    when 'autorizacion_vencida' then 'El respaldo en Drive perdió la autorización de Google'
    when 'con_errores' then 'El respaldo en Drive terminó con errores'
    else 'El respaldo en Drive falló' end;
  for r in
    select p.id from perfiles p join permisos_rol pr on pr.rol_id = p.rol_id
    where pr.modulo_id = 'configuracion' and pr.nivel = 'responsable'
  loop
    perform fn_notificar(r.id, 'respaldo_drive', v_titulo,
      case new.resultado when 'autorizacion_vencida'
        then 'Hay que volver a correr el autorizador de Drive en el PC de la oficina (docs/respaldo-drive.md).'
        else left(coalesce(new.detalle, ''), 300) end,
      '/configuracion', 'respaldo_drive_corridas', new.id, new.resultado = 'autorizacion_vencida');
  end loop;
  return null;
end;
$$;
drop trigger if exists trg_respaldo_avisar on public.respaldo_drive_corridas;
create trigger trg_respaldo_avisar after update on public.respaldo_drive_corridas
  for each row execute function public.fn_respaldo_avisar();

-- ============================================================ 4) privilegios y RLS
do $$
declare
  t text;
  r record;
begin
  foreach t in array array['respaldo_drive_archivos', 'respaldo_drive_carpetas', 'respaldo_drive_corridas'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon', t);
    execute format('revoke insert, update, delete, truncate, trigger, references on table public.%I from authenticated', t);
    for r in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on public.%I', r.policyname, t);
    end loop;
  end loop;
end $$;
revoke all on table public.v_respaldo_drive_resumen from anon;

-- Leer: Configuración "consultar". Escribir: solo la función (service_role salta la RLS).
create policy respaldo_archivos_select on public.respaldo_drive_archivos for select to authenticated
  using (fn_tiene_permiso('configuracion', 'consultar'));
create policy respaldo_carpetas_select on public.respaldo_drive_carpetas for select to authenticated
  using (fn_tiene_permiso('configuracion', 'consultar'));
create policy respaldo_corridas_select on public.respaldo_drive_corridas for select to authenticated
  using (fn_tiene_permiso('configuracion', 'consultar'));

revoke all on function public.fn_respaldo_pendientes(int) from public, anon, authenticated;
revoke all on function public.fn_respaldo_tomar_turno() from public, anon, authenticated;
grant execute on function public.fn_respaldo_pendientes(int) to service_role;
grant execute on function public.fn_respaldo_tomar_turno() to service_role;
-- de trigger: nadie
revoke all on function public.fn_respaldo_avisar() from public, anon, authenticated;
