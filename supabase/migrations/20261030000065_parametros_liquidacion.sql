-- RRHH → Parámetros de liquidación (2026-10-30). Los valores de ley a nivel de empresa, con
-- historial por vigencia. La ficha de cada persona hereda de acá y puede sobrescribir
-- (empleado_parametros, migración 66).
--
-- Regla del orquestador: NINGÚN valor numérico de ley en el código ni en una migración. Esta
-- migración solo crea la ESTRUCTURA y los NOMBRES de los parámetros; los valores los carga
-- Jhojan (con RRHH y contabilidad) desde la pantalla. Si cambia la ley o el salario mínimo,
-- se registra un valor nuevo con su fecha de vigencia: nunca se sobrescribe el anterior,
-- para que lo calculado con un valor viejo se pueda explicar después.
--
-- Diseño:
--   - parametros_liquidacion: el catálogo (clave, nombre, unidad, grupo). RRHH puede agregar
--     uno nuevo o desactivarlo sin migrar (si la ley crea un concepto nuevo).
--   - parametro_valores: valor + vigente_desde + quién y cuándo. Solo se insertan. Una
--     corrección del mismo día es otra fila: gana la registrada más tarde.
--   - fn_parametros_vigentes(fecha): el valor vigente de cada parámetro en esa fecha.
--
-- Verificación: supabase/verificaciones/20261030000065_verificar.sql
-- Rollback:     supabase/rollbacks/20261030000065_parametros_liquidacion_down.sql
-- Idempotente.

create table if not exists public.parametros_liquidacion (
  clave text primary key check (clave ~ '^[a-z0-9_]+$'),
  nombre text not null check (length(trim(nombre)) > 0),
  unidad text not null check (unidad in ('pesos', 'porcentaje', 'dias', 'horas', 'veces_smmlv', 'numero')),
  grupo text not null,
  ayuda text,
  orden int not null default 0,
  activo boolean not null default true,
  creado_por uuid default auth.uid() references public.perfiles (id),
  created_at timestamptz not null default now()
);

-- Solo nombres. Ningún valor.
insert into public.parametros_liquidacion (clave, nombre, unidad, grupo, ayuda, orden) values
  ('smmlv', 'Salario mínimo mensual (SMMLV)', 'pesos', 'Salario y auxilio', null, 10),
  ('auxilio_transporte', 'Auxilio de transporte mensual', 'pesos', 'Salario y auxilio', 'La ficha de cada persona lo hereda; se cambia en la ficha solo si esa persona tiene un valor distinto.', 20),
  ('tope_auxilio_smmlv', 'Tope para el auxilio de transporte', 'veces_smmlv', 'Salario y auxilio', 'Hasta cuántos salarios mínimos aplica el auxilio.', 30),
  ('dias_base_mes', 'Días base del mes', 'dias', 'Salario y auxilio', null, 40),
  ('salud_trabajador', 'Aporte a salud (EPS) del trabajador', 'porcentaje', 'Aportes del trabajador', 'Sobre el IBC.', 50),
  ('pension_trabajador', 'Aporte a pensión del trabajador', 'porcentaje', 'Aportes del trabajador', 'Sobre el IBC.', 60),
  ('salud_empleador', 'Aporte a salud del empleador', 'porcentaje', 'Aportes del empleador', null, 70),
  ('pension_empleador', 'Aporte a pensión del empleador', 'porcentaje', 'Aportes del empleador', null, 80),
  ('caja_compensacion', 'Caja de compensación', 'porcentaje', 'Aportes del empleador', null, 90),
  ('icbf', 'ICBF', 'porcentaje', 'Aportes del empleador', null, 100),
  ('sena', 'SENA', 'porcentaje', 'Aportes del empleador', null, 110),
  ('arl_clase_1', 'ARL — riesgo clase I', 'porcentaje', 'ARL', null, 120),
  ('arl_clase_2', 'ARL — riesgo clase II', 'porcentaje', 'ARL', null, 130),
  ('arl_clase_3', 'ARL — riesgo clase III', 'porcentaje', 'ARL', null, 140),
  ('arl_clase_4', 'ARL — riesgo clase IV', 'porcentaje', 'ARL', null, 150),
  ('arl_clase_5', 'ARL — riesgo clase V', 'porcentaje', 'ARL', null, 160),
  ('cesantias', 'Cesantías', 'porcentaje', 'Prestaciones sociales', null, 170),
  ('intereses_cesantias', 'Intereses sobre cesantías', 'porcentaje', 'Prestaciones sociales', null, 180),
  ('prima', 'Prima de servicios', 'porcentaje', 'Prestaciones sociales', null, 190),
  ('vacaciones', 'Vacaciones', 'porcentaje', 'Prestaciones sociales', null, 200),
  ('jornada_semanal', 'Jornada máxima semanal', 'horas', 'Jornada y recargos', null, 210),
  ('horas_mes', 'Horas base del mes (divisor de la hora)', 'horas', 'Jornada y recargos', null, 220),
  ('extra_diurna', 'Hora extra diurna (recargo)', 'porcentaje', 'Jornada y recargos', null, 230),
  ('extra_nocturna', 'Hora extra nocturna (recargo)', 'porcentaje', 'Jornada y recargos', null, 240),
  ('recargo_nocturno', 'Recargo nocturno', 'porcentaje', 'Jornada y recargos', null, 250),
  ('recargo_dominical', 'Recargo dominical y festivo', 'porcentaje', 'Jornada y recargos', null, 260)
on conflict (clave) do nothing;

create table if not exists public.parametro_valores (
  id uuid primary key default gen_random_uuid(),
  clave text not null references public.parametros_liquidacion (clave),
  vigente_desde date not null,
  valor numeric(16,4) not null check (valor >= 0),
  nota text,                                      -- fuente: decreto, resolución, contador…
  registrado_por uuid not null default auth.uid() references public.perfiles (id),
  registrado_en timestamptz not null default now()
);
create index if not exists idx_parametro_valores on public.parametro_valores (clave, vigente_desde desc, registrado_en desc);

-- Un valor registrado no se cambia ni se borra: si estaba mal, se registra otro.
create or replace function public.fn_parametro_valor_inmutable()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('postgres', 'supabase_admin') then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  raise exception 'Un valor registrado no se cambia ni se borra: registra el valor correcto con su fecha de vigencia.';
end;
$$;
drop trigger if exists trg_parametro_valor_inmutable on public.parametro_valores;
create trigger trg_parametro_valor_inmutable
  before update or delete on public.parametro_valores
  for each row execute function public.fn_parametro_valor_inmutable();

-- Quién y cuándo los pone la base.
create or replace function public.fn_parametro_valor_quien()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('postgres', 'supabase_admin') then
    new.registrado_por := auth.uid();
    -- clock_timestamp: dos registros en la misma transacción quedan en orden.
    new.registrado_en := clock_timestamp();
  end if;
  return new;
end;
$$;
drop trigger if exists trg_parametro_valor_quien on public.parametro_valores;
create trigger trg_parametro_valor_quien
  before insert on public.parametro_valores
  for each row execute function public.fn_parametro_valor_quien();

-- El valor vigente de cada parámetro activo en una fecha (null si todavía no hay ninguno).
create or replace function public.fn_parametros_vigentes(p_fecha date default ((now() at time zone 'America/Bogota')::date))
returns table (clave text, nombre text, unidad text, grupo text, valor numeric, vigente_desde date)
language sql
stable
security definer
set search_path = public
as $$
  select p.clave, p.nombre, p.unidad, p.grupo, v.valor, v.vigente_desde
  from parametros_liquidacion p
  left join lateral (
    select pv.valor, pv.vigente_desde
    from parametro_valores pv
    where pv.clave = p.clave and pv.vigente_desde <= p_fecha
    order by pv.vigente_desde desc, pv.registrado_en desc
    limit 1
  ) v on true
  where p.activo and fn_tiene_permiso('rrhh', 'trabajar')
  order by p.orden, p.nombre;
$$;

-- RLS: RRHH "trabajar" ve y registra. Nadie borra.
alter table public.parametros_liquidacion enable row level security;
drop policy if exists parametros_liquidacion_select on public.parametros_liquidacion;
create policy parametros_liquidacion_select on public.parametros_liquidacion for select to authenticated
  using (fn_tiene_permiso('rrhh', 'trabajar'));
drop policy if exists parametros_liquidacion_insert on public.parametros_liquidacion;
create policy parametros_liquidacion_insert on public.parametros_liquidacion for insert to authenticated
  with check (fn_tiene_permiso('rrhh', 'trabajar'));
drop policy if exists parametros_liquidacion_update on public.parametros_liquidacion;
create policy parametros_liquidacion_update on public.parametros_liquidacion for update to authenticated
  using (fn_tiene_permiso('rrhh', 'trabajar')) with check (fn_tiene_permiso('rrhh', 'trabajar'));

alter table public.parametro_valores enable row level security;
drop policy if exists parametro_valores_select on public.parametro_valores;
create policy parametro_valores_select on public.parametro_valores for select to authenticated
  using (fn_tiene_permiso('rrhh', 'trabajar'));
drop policy if exists parametro_valores_insert on public.parametro_valores;
create policy parametro_valores_insert on public.parametro_valores for insert to authenticated
  with check (fn_tiene_permiso('rrhh', 'trabajar'));

revoke all on function public.fn_parametros_vigentes(date) from public, anon;
grant execute on function public.fn_parametros_vigentes(date) to authenticated, service_role;
revoke all on function public.fn_parametro_valor_inmutable() from public, anon, authenticated;
revoke all on function public.fn_parametro_valor_quien() from public, anon, authenticated;
