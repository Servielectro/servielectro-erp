-- Descartar un borrador vacío (2026-10-27). Hueco que encontró Jhojan probando las actas: dos
-- borradores de prueba "en llenado" sin forma de quitarlos ("no tengo como eliminarlas sin causa,
-- porque solo estaba probando el tema").
--
-- La regla de la 75/85 sigue: lo que tiene valor probatorio no se borra, se ANULA con motivo. El
-- corte está en lo que lo vuelve prueba:
--
--   DESCARTAR (se va de verdad): formato en "borrador", SIN ninguna firma, SIN archivos (ni filas
--     en sst_formato_archivos ni objetos en su carpeta de Storage), que no esté enlazado a una
--     reunión ni a un evento, y SOLO quien lo creó. Las respuestas escritas no lo impiden: sin
--     firmas no prueban nada.
--   ANULAR con motivo: todo lo demás (desde la primera firma, con archivos cargados, o si lo creó
--     otro). Como hoy. Una firma no tiene vuelta atrás nunca.
--
--   Reuniones: igual. Descarta quien la creó, en "preparando", sin aviso de grabación dado, sin
--     audio (ni registrado ni en su carpeta de Storage), sin transcripción ni acta, sin documento
--     para firmar y sin compromisos. Con aviso dado o audio subido, solo se anula.
--
-- Va por funciones (security definer) y no por una política de delete: así las reglas de los
-- triggers de la 75 y la 86 ("no se borra") siguen intactas para todo lo demás. Las funciones
-- toman el registro con FOR UPDATE (nadie le firma en el mismo instante) y comprueban todo
-- adentro; no dependen de lo que la app haya mirado antes.
--
-- Lo que se descarta deja una huella mínima en registros_descartados (qué era, quién lo creó,
-- quién lo descartó y cuándo), sin el contenido: un borrador no es prueba, pero que alguien borra
-- cosas sí es un dato. La ve Configuración "responsable".
--
-- Ojo, sin señal: si el borrador vive todavía en un celular sin sincronizar y se descarta en el
-- servidor, lo que ese celular mande después (fotos, firmas) choca y queda como rechazado en su
-- cola. Descartar es para lo de prueba, no para un formato en uso.
--
-- Va después de la 86. Idempotente.
-- Verificación: supabase/verificaciones/20261120000092_verificar.sql
-- Rollback:     supabase/rollbacks/20261120000092_descartar_borradores_down.sql

create table if not exists public.registros_descartados (
  id uuid primary key default gen_random_uuid(),
  tabla text not null,
  registro_id uuid not null,
  descripcion text,                       -- "Acta de inicio prueba", "Reunión: …"
  creado_por uuid references public.perfiles (id),
  creado_en timestamptz,
  descartado_por uuid not null references public.perfiles (id),
  descartado_en timestamptz not null default now()
);
alter table public.registros_descartados enable row level security;
revoke all on table public.registros_descartados from anon;
revoke insert, update, delete, truncate, trigger, references on table public.registros_descartados from authenticated;
drop policy if exists registros_descartados_select on public.registros_descartados;
create policy registros_descartados_select on public.registros_descartados for select to authenticated
  using (fn_tiene_permiso('configuracion', 'responsable'));

-- ============================================================ 1) formatos (SG-SST y actas de Proyectos)
-- Por qué NO se puede descartar (null = sí se puede). La usa la pantalla para mostrar el botón y
-- la función de descartar para decidir: una sola regla.
create or replace function public.fn_formato_por_que_no_descartar(p_formato_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  f record;
begin
  select id, estado, creado_por, ambito into f from sst_formatos where id = p_formato_id;
  if f.id is null or not fn_plantillas_permiso(f.ambito, 'consultar') then
    return 'Ese formato no existe.';
  end if;
  if f.creado_por is distinct from auth.uid() then
    return 'Solo quien lo creó lo descarta. Si no sirve, se anula con motivo.';
  end if;
  if f.estado <> 'borrador' then
    return 'Ya no es un borrador: se anula con motivo.';
  end if;
  if exists (select 1 from sst_formato_firmas where formato_id = f.id) then
    return 'Ya tiene firmas: se anula con motivo.';
  end if;
  if exists (select 1 from sst_formato_archivos where formato_id = f.id)
     or exists (select 1 from storage.objects o where o.bucket_id = 'sgsst' and o.name like 'formatos/' || f.id::text || '/%') then
    return 'Ya tiene fotos o archivos cargados: se anula con motivo.';
  end if;
  if exists (select 1 from reuniones r where r.formato_id = f.id) then
    return 'Es el acta de una reunión: se anula con motivo.';
  end if;
  if exists (select 1 from sst_eventos e where e.investigacion_formato_id = f.id) then
    return 'Es la investigación de un evento: se anula con motivo.';
  end if;
  if exists (select 1 from sst_plan_evidencias v where v.formato_id = f.id) then
    return 'Es evidencia del plan de trabajo: se anula con motivo.';
  end if;
  return null;
end;
$$;

create or replace function public.fn_descartar_formato(p_formato_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  f record;
  v_motivo text;
begin
  -- Nadie le firma ni le sube nada mientras se decide.
  select f2.id, f2.creado_por, f2.creado_en, p.nombre as plantilla
    into f
  from sst_formatos f2 join sst_plantillas p on p.id = f2.plantilla_id
  where f2.id = p_formato_id
  for update of f2;
  v_motivo := fn_formato_por_que_no_descartar(p_formato_id);
  if v_motivo is not null then
    raise exception '%', v_motivo;
  end if;
  insert into registros_descartados (tabla, registro_id, descripcion, creado_por, creado_en, descartado_por)
  values ('sst_formatos', f.id, f.plantilla, f.creado_por, f.creado_en, auth.uid());
  delete from sst_formatos where id = f.id;   -- como dueño de la función: el trigger de la 75 lo deja
end;
$$;

-- ============================================================ 2) reuniones
create or replace function public.fn_reunion_por_que_no_descartar(p_reunion_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r record;
begin
  select id, estado, creada_por, aviso_grabacion, audio_path, transcripcion, acta, acta_revisada, formato_id
    into r from reuniones where id = p_reunion_id;
  if r.id is null or not fn_tiene_permiso('proyectos', 'consultar') then
    return 'Esa reunión no existe.';
  end if;
  if r.creada_por is distinct from auth.uid() then
    return 'Solo quien la creó la descarta. Si no sirve, se anula con motivo.';
  end if;
  if r.estado <> 'preparando' then
    return 'La reunión ya avanzó: se anula con motivo.';
  end if;
  if r.aviso_grabacion then
    return 'Ya se dio el aviso de grabación: se anula con motivo.';
  end if;
  if r.audio_path is not null
     or exists (select 1 from storage.objects o where o.bucket_id = 'reuniones' and o.name like r.id::text || '/%') then
    return 'Ya tiene audio: se anula con motivo.';
  end if;
  if r.transcripcion is not null or r.acta is not null or r.acta_revisada is not null or r.formato_id is not null then
    return 'Ya tiene transcripción o acta: se anula con motivo.';
  end if;
  if exists (select 1 from reunion_tareas t where t.reunion_id = r.id) then
    return 'Ya tiene compromisos: se anula con motivo.';
  end if;
  return null;
end;
$$;

create or replace function public.fn_descartar_reunion(p_reunion_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_motivo text;
begin
  select id, titulo, creada_por, creada_en into r from reuniones where id = p_reunion_id for update;
  v_motivo := fn_reunion_por_que_no_descartar(p_reunion_id);
  if v_motivo is not null then
    raise exception '%', v_motivo;
  end if;
  insert into registros_descartados (tabla, registro_id, descripcion, creado_por, creado_en, descartado_por)
  values ('reuniones', r.id, 'Reunión: ' || r.titulo, r.creada_por, r.creada_en, auth.uid());
  delete from reuniones where id = r.id;      -- como dueño de la función: el trigger de la 86 lo deja
end;
$$;

-- ============================================================ 3) privilegios
revoke all on function public.fn_formato_por_que_no_descartar(uuid) from public, anon;
revoke all on function public.fn_descartar_formato(uuid) from public, anon;
revoke all on function public.fn_reunion_por_que_no_descartar(uuid) from public, anon;
revoke all on function public.fn_descartar_reunion(uuid) from public, anon;
grant execute on function public.fn_formato_por_que_no_descartar(uuid) to authenticated;
grant execute on function public.fn_descartar_formato(uuid) to authenticated;
grant execute on function public.fn_reunion_por_que_no_descartar(uuid) to authenticated;
grant execute on function public.fn_descartar_reunion(uuid) to authenticated;
