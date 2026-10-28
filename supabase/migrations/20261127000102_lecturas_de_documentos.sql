-- Lecturas de documentos con IA, para el ANÁLISIS DE DOCUMENTOS de Administrativo (2026-10-27).
-- Pedido de Jhojan: "la revisión de lo que se envió vs lo que se firmó, en un cuadro de análisis de
-- documentos en administrativo, como ayuda de gestión de documentos". Caso que lo origina: en
-- Tintalá (CSE-26-151) el cliente editó el contrato en su PC; se firmó con 50/40/10 en vez de 50/50
-- y sin las causales de prórroga automática. Nadie lo vio hasta leer el escaneado hoja por hoja.
--
-- La IA lee UN documento UNA vez y su lectura queda aquí, con modelo, fecha y quién la pidió (con
-- página y cita por campo). No se edita ni se borra: si hace falta, se lee otra vez y queda la
-- nueva encima. La comparación entre dos documentos es determinista sobre estas lecturas (y, si el
-- documento es el contrato firmado con su registro confirmado en la 93, sobre lo confirmado).
-- Nada de esto alimenta un acta: las actas salen solo del contrato confirmado.
--
-- Permisos: los del documento (migración 90): quien lo ve, ve su lectura; quien trabaja en
-- Comercial o Proyectos pide una lectura nueva.
--
-- Va después de la 90. Idempotente.
-- Verificación: supabase/verificaciones/20261127000102_verificar.sql
-- Rollback:     supabase/rollbacks/20261127000102_lecturas_de_documentos_down.sql

create table if not exists public.documento_lecturas (
  id uuid primary key default gen_random_uuid(),
  documento_id uuid not null references public.proyecto_documentos (id) on delete restrict,
  lectura jsonb not null check (jsonb_typeof(lectura) = 'object'),
  proveedor text not null check (proveedor in ('OpenAI', 'Gemini')),
  modelo text not null,
  tokens_entrada int,
  tokens_salida int,
  leido_por uuid default auth.uid() references public.perfiles (id),
  leido_en timestamptz not null default now()
);
create index if not exists idx_documento_lecturas on public.documento_lecturas (documento_id, leido_en desc);

-- Quién y cuándo los pone la base. Una lectura no se cambia ni se borra.
create or replace function public.fn_documento_lecturas_reglas()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user in ('postgres', 'supabase_admin') then
    return coalesce(new, old);
  end if;
  if tg_op <> 'INSERT' then
    raise exception 'Una lectura no se cambia ni se borra: si hace falta, se lee otra vez.';
  end if;
  new.leido_por := auth.uid();
  new.leido_en := now();
  return new;
end;
$$;
drop trigger if exists trg_documento_lecturas_reglas on public.documento_lecturas;
create trigger trg_documento_lecturas_reglas before insert or update or delete on public.documento_lecturas
  for each row execute function public.fn_documento_lecturas_reglas();
revoke all on function public.fn_documento_lecturas_reglas() from public, anon, authenticated;

alter table public.documento_lecturas enable row level security;
revoke all on table public.documento_lecturas from anon;
revoke truncate, trigger, references, update, delete on table public.documento_lecturas from authenticated;
drop policy if exists documento_lecturas_select on public.documento_lecturas;
create policy documento_lecturas_select on public.documento_lecturas for select to authenticated
  using (fn_proyecto_documento_visible(documento_id));
drop policy if exists documento_lecturas_insert on public.documento_lecturas;
create policy documento_lecturas_insert on public.documento_lecturas for insert to authenticated
  with check (fn_proyecto_documentos_trabajar() and fn_proyecto_documento_visible(documento_id));
