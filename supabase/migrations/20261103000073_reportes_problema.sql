-- "Registrar problema" en todos los módulos (2026-10-26). Dictado por Jhojan:
--   "Para todos los módulos, en la parte superior, debemos incluir una pestaña que se llame:
--    Registrar problema... para que el que esté operando la app, registre algún daño o mal uso
--    o algo que no esté bien con la app. Con eso tenemos un registro de bugs."
--
-- reportes_problema:
--   - Quién y cuándo los pone la base. En qué pantalla estaba (ruta) lo manda la pantalla sola,
--     no se le pregunta. Qué pasó (obligatorio), qué esperaba que pasara, gravedad.
--   - contexto: lo que sirve para depurar y nada más: sin señal, tamaño de pantalla, versión
--     publicada, navegador. NUNCA contenido de formularios ni datos personales (la pantalla arma
--     ese objeto con una lista fija de claves; la base solo acepta esas claves).
--   - Captura o foto opcional, en el bucket privado reportes-problema, carpeta {quién}/.
--   - Cualquiera con sesión reporta y ve LOS SUYOS, con su estado y la nota de cierre (si nunca
--     sabe qué pasó, deja de reportar). Verlos todos y moverlos: quien administra, o sea
--     Configuración "responsable" (el mismo criterio de Usuarios y permisos).
--   - Estados: nuevo → en_revision → resuelto / no_es_error, con nota al cerrar. Un cerrado se
--     puede reabrir (vuelve a en_revision). Lo reportado no se edita y nada se borra.
--
-- Verificación: supabase/verificaciones/20261103000073_verificar.sql
-- Rollback:     supabase/rollbacks/20261103000073_reportes_problema_down.sql
-- Idempotente.

-- ============================================================ 1) tabla
create table if not exists public.reportes_problema (
  id uuid primary key default gen_random_uuid(),
  reportado_por uuid not null default auth.uid() references public.perfiles (id),
  reportado_en timestamptz not null default now(),
  ruta text not null check (length(trim(ruta)) > 0 and length(ruta) <= 500),
  que_paso text not null check (length(trim(que_paso)) > 0),
  que_esperaba text,
  gravedad text not null default 'estorba' check (gravedad in ('bloquea', 'estorba', 'detalle')),
  captura_path text unique,
  contexto jsonb not null default '{}'::jsonb,
  estado text not null default 'nuevo' check (estado in ('nuevo', 'en_revision', 'resuelto', 'no_es_error')),
  nota_cierre text,
  revisado_por uuid references public.perfiles (id),
  revisado_en timestamptz,
  constraint reportes_problema_contexto check (
    jsonb_typeof(contexto) = 'object'
    and (contexto - array['sin_senal', 'ancho', 'alto', 'version', 'navegador', 'app']) = '{}'::jsonb
  ),
  constraint reportes_problema_cierre check (
    estado not in ('resuelto', 'no_es_error') or length(trim(coalesce(nota_cierre, ''))) > 0
  )
);
create index if not exists idx_reportes_problema_quien on public.reportes_problema (reportado_por, reportado_en desc);
create index if not exists idx_reportes_problema_estado on public.reportes_problema (estado, reportado_en desc);

create or replace function public.fn_reportes_problema_admin()
returns boolean
language sql
stable
set search_path = public
as $$
  select fn_tiene_permiso('configuracion', 'responsable')
$$;

-- ============================================================ 2) reglas
create or replace function public.fn_reportes_problema_reglas()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('postgres', 'supabase_admin') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.reportado_por is distinct from auth.uid() then
      raise exception 'Un problema se reporta a nombre propio.';
    end if;
    if new.captura_path is not null and new.captura_path not like auth.uid()::text || '/%' then
      raise exception 'La captura no corresponde a quien reporta.';
    end if;
    new.reportado_en := now();
    new.estado := 'nuevo';
    new.nota_cierre := null; new.revisado_por := null; new.revisado_en := null;
    return new;
  end if;

  -- UPDATE: lo reportado no se edita; solo quien administra mueve el estado.
  if (new.reportado_por, new.reportado_en, new.ruta, new.que_paso, new.que_esperaba, new.gravedad, new.captura_path, new.contexto)
     is distinct from (old.reportado_por, old.reportado_en, old.ruta, old.que_paso, old.que_esperaba, old.gravedad, old.captura_path, old.contexto) then
    raise exception 'Lo reportado no se edita. Si falta algo, reporta otro.';
  end if;
  if not fn_reportes_problema_admin() then
    raise exception 'Solo quien administra cambia el estado de un reporte.';
  end if;
  if new.estado is distinct from old.estado then
    if not ((old.estado = 'nuevo' and new.estado in ('en_revision', 'resuelto', 'no_es_error'))
            or (old.estado = 'en_revision' and new.estado in ('resuelto', 'no_es_error'))
            or (old.estado in ('resuelto', 'no_es_error') and new.estado = 'en_revision')) then
      raise exception 'Un reporte no pasa de "%" a "%".', old.estado, new.estado;
    end if;
    if new.estado = 'en_revision' then
      new.nota_cierre := coalesce(new.nota_cierre, old.nota_cierre);
    end if;
  end if;
  new.revisado_por := auth.uid();
  new.revisado_en := now();
  return new;
end;
$$;
drop trigger if exists trg_reportes_problema_reglas on public.reportes_problema;
create trigger trg_reportes_problema_reglas
  before insert or update on public.reportes_problema
  for each row execute function public.fn_reportes_problema_reglas();

-- ============================================================ 3) RLS
alter table public.reportes_problema enable row level security;
revoke all on table public.reportes_problema from anon;
drop policy if exists reportes_problema_select on public.reportes_problema;
create policy reportes_problema_select on public.reportes_problema for select to authenticated
  using (reportado_por = auth.uid() or fn_reportes_problema_admin());
drop policy if exists reportes_problema_insert on public.reportes_problema;
create policy reportes_problema_insert on public.reportes_problema for insert to authenticated
  with check (reportado_por = auth.uid());
drop policy if exists reportes_problema_update on public.reportes_problema;
create policy reportes_problema_update on public.reportes_problema for update to authenticated
  using (fn_reportes_problema_admin()) with check (fn_reportes_problema_admin());
-- Sin delete.

-- ============================================================ 4) capturas
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('reportes-problema', 'reportes-problema', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists reportes_problema_capturas_select on storage.objects;
create policy reportes_problema_capturas_select on storage.objects for select to authenticated
  using (bucket_id = 'reportes-problema'
         and ((storage.foldername(name))[1] = auth.uid()::text or fn_reportes_problema_admin()));
drop policy if exists reportes_problema_capturas_insert on storage.objects;
create policy reportes_problema_capturas_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'reportes-problema' and (storage.foldername(name))[1] = auth.uid()::text);
-- Sin reemplazar ni borrar.

-- ============================================================ 5) privilegios
revoke all on function public.fn_reportes_problema_reglas() from public, anon, authenticated;
revoke all on function public.fn_reportes_problema_admin() from public, anon;
grant execute on function public.fn_reportes_problema_admin() to authenticated, service_role;
