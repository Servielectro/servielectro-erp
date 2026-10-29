-- Observaciones de revisión en "Registrar problema" (2026-10-29). Este fin de semana la profesional
-- de SST recorre el módulo SG-SST del ERP y deja sus observaciones; Jhojan y el orquestador las
-- estudian y deciden qué se implementa. Jhojan: "las vamos a estudiar y vamos a mirar qué
-- mejoramos y qué no".
--
-- NO es una tabla nueva: se extiende reportes_problema (migración 73), que ya es "alguien anotó algo
-- sobre una pantalla del ERP" con la ruta capturada sola, foto en su bucket, "ve los suyos" y nada
-- se edita ni se borra. Una sola bandeja, no dos.
--
--   tipo:    problema (algo está roto) · hallazgo (incumple una norma) · sugerencia (mejora
--            opcional) · duda. Lo de antes queda como 'problema'.
--   norma:   texto libre (Resolución 0312 de 2019, Decreto 1072 de 2015, Resolución 4272 de 2021…).
--            Un HALLAZGO exige la norma: es lo que lo separa de una sugerencia y lo que sirve para
--            priorizar (un hallazgo con norma no es opcional).
--   seccion: el nombre de la pantalla (su título), lo pone la pantalla sola, como la ruta.
--   modulo:  sale de la ruta (/sgsst/formatos → sgsst), para agrupar la bandeja. Calculado.
--   gravedad: solo para un problema (a una sugerencia no le aplica "me bloquea").
--
-- Estados (los mismos para todos los tipos):
--   nuevo → en_revision ("en estudio") → aceptado → resuelto ("implementada")
--                                      ↘ descartado, CON razón obligatoria
--   'no_es_error' pasa a 'descartado' (es lo mismo: se decidió no hacer nada, con su nota).
--   Un cerrado (resuelto o descartado) se puede reabrir: vuelve a en_revision.
-- Quién respondió y cuándo: revisado_por / revisado_en (ya estaban).
--
-- Va después de la 73. Idempotente.
-- Verificación: supabase/verificaciones/20261129000104_verificar.sql
-- Rollback:     supabase/rollbacks/20261129000104_observaciones_en_reportes_down.sql

-- ============================================================ 1) columnas
alter table public.reportes_problema add column if not exists tipo text not null default 'problema';
alter table public.reportes_problema add column if not exists norma text;
alter table public.reportes_problema add column if not exists seccion text;
alter table public.reportes_problema add column if not exists modulo text
  generated always as (nullif(split_part(ruta, '/', 2), '')) stored;
alter table public.reportes_problema alter column gravedad drop not null;

alter table public.reportes_problema drop constraint if exists reportes_problema_tipo;
alter table public.reportes_problema add constraint reportes_problema_tipo
  check (tipo in ('problema', 'hallazgo', 'sugerencia', 'duda'));
alter table public.reportes_problema drop constraint if exists reportes_problema_norma;
alter table public.reportes_problema add constraint reportes_problema_norma
  check (tipo <> 'hallazgo' or length(trim(coalesce(norma, ''))) > 0);
alter table public.reportes_problema drop constraint if exists reportes_problema_gravedad_requerida;
alter table public.reportes_problema add constraint reportes_problema_gravedad_requerida
  check (tipo <> 'problema' or gravedad is not null);
alter table public.reportes_problema drop constraint if exists reportes_problema_seccion;
alter table public.reportes_problema add constraint reportes_problema_seccion
  check (seccion is null or length(seccion) <= 200);

-- ============================================================ 2) estados
alter table public.reportes_problema drop constraint if exists reportes_problema_estado_check;
alter table public.reportes_problema drop constraint if exists reportes_problema_cierre;
-- Lo que estaba como "no es un error" queda como descartado (con la misma nota). Como postgres,
-- el trigger lo deja pasar sin tocar revisado_por.
update public.reportes_problema set estado = 'descartado' where estado = 'no_es_error';
alter table public.reportes_problema add constraint reportes_problema_estado_check
  check (estado in ('nuevo', 'en_revision', 'aceptado', 'resuelto', 'descartado'));
alter table public.reportes_problema add constraint reportes_problema_cierre
  check (estado not in ('resuelto', 'descartado') or length(trim(coalesce(nota_cierre, ''))) > 0);
create index if not exists idx_reportes_problema_modulo on public.reportes_problema (modulo, tipo, estado);

-- ============================================================ 3) reglas
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
      raise exception 'Un reporte se registra a nombre propio.';
    end if;
    if new.captura_path is not null and new.captura_path not like auth.uid()::text || '/%' then
      raise exception 'La captura no corresponde a quien reporta.';
    end if;
    -- La gravedad es de un problema; en los otros tipos no se guarda.
    if new.tipo <> 'problema' then
      new.gravedad := null;
    end if;
    new.reportado_en := now();
    new.estado := 'nuevo';
    new.nota_cierre := null; new.revisado_por := null; new.revisado_en := null;
    return new;
  end if;

  -- UPDATE: lo reportado no se edita; solo quien administra mueve el estado.
  if (new.reportado_por, new.reportado_en, new.ruta, new.que_paso, new.que_esperaba, new.gravedad, new.captura_path, new.contexto,
      new.tipo, new.norma, new.seccion)
     is distinct from (old.reportado_por, old.reportado_en, old.ruta, old.que_paso, old.que_esperaba, old.gravedad, old.captura_path, old.contexto,
      old.tipo, old.norma, old.seccion) then
    raise exception 'Lo reportado no se edita. Si falta algo, registra otro.';
  end if;
  if not fn_reportes_problema_admin() then
    raise exception 'Solo quien administra cambia el estado de un reporte.';
  end if;
  if new.estado is distinct from old.estado then
    if not ((old.estado = 'nuevo' and new.estado in ('en_revision', 'aceptado', 'resuelto', 'descartado'))
            or (old.estado = 'en_revision' and new.estado in ('aceptado', 'resuelto', 'descartado'))
            or (old.estado = 'aceptado' and new.estado in ('en_revision', 'resuelto', 'descartado'))
            or (old.estado in ('resuelto', 'descartado') and new.estado = 'en_revision')) then
      raise exception 'Un reporte no pasa de "%" a "%".', old.estado, new.estado;
    end if;
    if new.estado in ('en_revision', 'aceptado') then
      new.nota_cierre := coalesce(new.nota_cierre, old.nota_cierre);
    end if;
  end if;
  new.revisado_por := auth.uid();
  new.revisado_en := now();
  return new;
end;
$$;
revoke all on function public.fn_reportes_problema_reglas() from public, anon, authenticated;
