-- Consecutivo de cotizaciones visible y ajustable desde Configuración, con registro de
-- quién lo cambió, cuándo, de qué número a cuál y por qué.
--
-- Contexto (2026-10-15): cotizacion_consecutivos tenía ultimo_numero = 0 para 2026 y la
-- primera cotización del ERP habría salido CSE-26-001, chocando con la numeración real de
-- Jhojan. Se ajustó a mano a 157 (próxima: CSE-26-158). Para que no se vuelva a descubrir
-- tarde, el número pasa a verse y ajustarse en Configuración.
--
-- Diseño:
--   - cotizacion_consecutivos_ajustes: historial. Solo se escribe desde
--     fn_ajustar_consecutivo (no hay políticas de insert/update/delete): nadie puede
--     borrar ni maquillar el historial desde la app.
--   - fn_estado_consecutivos(): lee contador + mayor número ya usado por año. Security
--     definer porque cotizacion_consecutivos exige comercial/consultar (tanda 3) y quien
--     administra Configuración no tiene por qué tener Comercial. Exige configuracion/consultar.
--   - fn_ajustar_consecutivo(): exige configuracion/responsable y un motivo; NO deja
--     poner el contador por debajo del mayor número ya emitido ese año (la siguiente
--     cotización repetiría un código existente).
--
-- Formato del código (fn_siguiente_codigo_cotizacion): CSE-AA-NNN.
--
-- Rollback: supabase/rollbacks/20261015000044_consecutivo_cotizaciones_configuracion_down.sql
-- Verificación: supabase/verificaciones/20261015000044_verificar.sql
-- Idempotente.

-- ============================================================ historial
create table if not exists public.cotizacion_consecutivos_ajustes (
  id uuid primary key default gen_random_uuid(),
  anio smallint not null,
  numero_anterior integer,            -- null si el año no tenía contador
  numero_nuevo integer not null check (numero_nuevo >= 0),
  motivo text not null check (length(trim(motivo)) > 0),
  ajustado_por uuid references auth.users (id) on delete set null,
  ajustado_por_nombre text,           -- copia del nombre: el historial no depende del perfil
  ajustado_en timestamptz not null default now()
);

create index if not exists idx_consecutivos_ajustes_anio
  on public.cotizacion_consecutivos_ajustes (anio, ajustado_en desc);

alter table public.cotizacion_consecutivos_ajustes enable row level security;
revoke all on table public.cotizacion_consecutivos_ajustes from anon;
revoke truncate, trigger, references on table public.cotizacion_consecutivos_ajustes from authenticated;

do $$
declare r record;
begin
  for r in select policyname from pg_policies
           where schemaname = 'public' and tablename = 'cotizacion_consecutivos_ajustes'
  loop
    execute format('drop policy %I on public.cotizacion_consecutivos_ajustes', r.policyname);
  end loop;
end $$;

create policy cotizacion_consecutivos_ajustes_select on public.cotizacion_consecutivos_ajustes
  for select to authenticated
  using (fn_tiene_permiso('configuracion', 'consultar'));

-- El ajuste manual de hoy (0 → 157), para que el historial arranque completo. Solo si el
-- contador está en 157 y todavía no hay historial de 2026.
insert into public.cotizacion_consecutivos_ajustes
  (anio, numero_anterior, numero_nuevo, motivo, ajustado_por_nombre)
select 2026, 0, 157,
       'Ajuste inicial a la numeración real de 2026 (iba en 157). Hecho por SQL el 15/10/2026, aprobado por Jhojan; registrado al correr la migración 44.',
       'Ajuste por SQL'
where exists (select 1 from public.cotizacion_consecutivos where anio = 2026 and ultimo_numero = 157)
  and not exists (select 1 from public.cotizacion_consecutivos_ajustes where anio = 2026);

-- ============================================================ mayor número emitido
-- Mayor NNN de los códigos CSE-AA-NNN de ese año (0 si no hay).
create or replace function public.fn_mayor_consecutivo_emitido(p_anio smallint)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(max(substring(c.codigo from '^CSE-\d{2}-(\d+)$')::int), 0)
  from cotizaciones c
  where c.codigo ~ ('^CSE-' || lpad((p_anio % 100)::text, 2, '0') || '-\d+$');
$$;

-- ============================================================ lectura
create or replace function public.fn_estado_consecutivos()
returns table (anio smallint, ultimo_numero integer, mayor_emitido integer)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_anio_actual smallint := extract(year from (now() at time zone 'America/Bogota'))::smallint;
begin
  if not fn_tiene_permiso('configuracion', 'consultar') then
    raise exception 'No tienes permiso para ver la configuración.';
  end if;
  return query
  select a.anio, coalesce(cc.ultimo_numero, 0), fn_mayor_consecutivo_emitido(a.anio)
  from (
    select v_anio_actual as anio
    union
    select cc2.anio from cotizacion_consecutivos cc2
  ) a
  left join cotizacion_consecutivos cc on cc.anio = a.anio
  order by a.anio desc;
end;
$$;

-- ============================================================ ajuste
create or replace function public.fn_ajustar_consecutivo(
  p_anio smallint,
  p_ultimo_numero integer,
  p_motivo text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_anterior integer;
  v_mayor integer;
  v_nombre text;
begin
  if not fn_tiene_permiso('configuracion', 'responsable') then
    raise exception 'Solo un responsable de Configuración puede cambiar el consecutivo.';
  end if;
  if p_anio is null or p_anio < 2020 or p_anio > 2100 then
    raise exception 'Año inválido.';
  end if;
  if p_ultimo_numero is null or p_ultimo_numero < 0 or p_ultimo_numero > 999999 then
    raise exception 'El número debe estar entre 0 y 999999.';
  end if;
  if p_motivo is null or length(trim(p_motivo)) = 0 then
    raise exception 'Escribe el motivo del cambio: queda en el historial.';
  end if;

  -- Bloquea el contador mientras se ajusta (si alguien guarda una cotización al mismo
  -- tiempo, espera).
  select ultimo_numero into v_anterior
  from cotizacion_consecutivos where anio = p_anio for update;

  v_mayor := fn_mayor_consecutivo_emitido(p_anio);
  if p_ultimo_numero < v_mayor then
    raise exception 'Ya existe la cotización CSE-%-% en el sistema: el último usado no puede ser menor que %.',
      lpad((p_anio % 100)::text, 2, '0'), lpad(v_mayor::text, 3, '0'), v_mayor;
  end if;

  if v_anterior is not distinct from p_ultimo_numero then
    return p_ultimo_numero;  -- sin cambio, sin registro
  end if;

  insert into cotizacion_consecutivos (anio, ultimo_numero)
  values (p_anio, p_ultimo_numero)
  on conflict (anio) do update set ultimo_numero = excluded.ultimo_numero;

  select nombre into v_nombre from perfiles where id = auth.uid();

  insert into cotizacion_consecutivos_ajustes
    (anio, numero_anterior, numero_nuevo, motivo, ajustado_por, ajustado_por_nombre)
  values (p_anio, v_anterior, p_ultimo_numero, trim(p_motivo), auth.uid(), v_nombre);

  return p_ultimo_numero;
end;
$$;

-- Solo la usan las otras dos (corren como dueño): nadie la llama directo.
revoke all on function public.fn_mayor_consecutivo_emitido(smallint) from public, anon, authenticated;
revoke all on function public.fn_estado_consecutivos() from public, anon;
revoke all on function public.fn_ajustar_consecutivo(smallint, integer, text) from public, anon;
grant execute on function public.fn_estado_consecutivos() to authenticated;
grant execute on function public.fn_ajustar_consecutivo(smallint, integer, text) to authenticated;
