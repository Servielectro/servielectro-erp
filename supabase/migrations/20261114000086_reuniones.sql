-- Migración 86: reuniones presenciales — grabación → transcripción → acta → revisión → firma (2026-10-27).
--
-- Pedido de Jhojan: "conectemos actas-servielectro a un submódulo… para iniciar grabación, su
-- respectiva transcripción y el resumen y todo lo que ya tenemos". La lógica es la de su app
-- (C:\Proyectos\actas-servielectro): las dos etapas separadas y sus dos prompts, copiados TAL
-- CUAL en src/lib/reuniones/prompts (no se reescriben). Lo que pone el ERP:
--
--   - La reunión cuelga de una obra (proyecto) y se ve con el módulo Proyectos.
--   - AVISO DE GRABACIÓN: antes de grabar (o de subir un audio), quien graba confirma que avisó a
--     los asistentes y anota quiénes estaban. Queda quién y cuándo, y no se deshace. Sin aviso, la
--     base no recibe audio ni transcripción.
--   - El AUDIO sube directo a Storage desde el celular (bucket "reuniones"); nunca viaja dentro de
--     una llamada al servidor (el error del RUT: "Body exceeded 1 MB limit").
--   - Se guarda lo que sale de cada etapa: la transcripción (etapa 1) y el acta tal como la redactó
--     la etapa 2 (`acta`), aparte de la que revisa y aprueba Jhojan (`acta_revisada`). Rehacer el
--     acta no vuelve a gastar el audio.
--   - Aprobar es de Proyectos "responsable". Aprobada, nada del contenido cambia. Nada se borra:
--     se anula con motivo.
--   - FIRMA y PDF con el mismo motor de plantillas (migración 85): la plantilla "Acta de reunión"
--     se siembra aquí con la estructura del prompt 02_acta.md, y el acta aprobada pasa a un
--     formato de esa plantilla (`formato_id`) que se firma en el celular como cualquier acta.
--   - COMPROMISOS → TAREAS: propuesto, no automático. `reunion_tareas` anota qué compromiso se
--     volvió qué tarea (una sola vez cada uno).
--   - RETENCIÓN DEL AUDIO: `audio_descartable_desde` queda VACÍO. El plazo lo decide Jhojan; esta
--     migración no fija ninguno ni borra nada.
--
-- Depende de la 85. Verificación: supabase/verificaciones/20261114000086_verificar.sql
-- Rollback: supabase/rollbacks/20261114000086_reuniones_down.sql. Idempotente.

-- ============================================================ 1) la reunión
create table if not exists public.reuniones (
  id uuid primary key default gen_random_uuid(),       -- lo genera el celular: el audio va a {id}/
  proyecto_id uuid not null references public.proyectos (id),
  titulo text not null check (length(trim(titulo)) > 0),
  lugar text,
  fecha date not null default ((now() at time zone 'America/Bogota')::date),
  -- Aviso de grabación: lo confirma quien graba; la base pone quién y cuándo.
  aviso_grabacion boolean not null default false,
  aviso_por uuid references public.perfiles (id),
  aviso_en timestamptz,
  asistentes jsonb not null default '[]'::jsonb,       -- [{ "nombre", "parte": servielectro|cliente|tercero, "rol" }]
  -- Audio (bucket reuniones, {id}/...)
  audio_path text unique,
  audio_mime text,
  audio_bytes bigint,
  duracion_s int check (duracion_s is null or duracion_s >= 0),
  audio_descartable_desde date,                        -- retención: PENDIENTE de que Jhojan defina el plazo
  audio_descartado_en timestamptz,
  audio_descartado_por uuid references public.perfiles (id),
  -- Proceso
  estado text not null default 'preparando'
    check (estado in ('preparando', 'audio_subido', 'transcribiendo', 'redactando', 'lista', 'error', 'aprobada', 'anulada')),
  error text,
  transcripcion text,                                  -- etapa 1, literal
  acta jsonb,                                          -- etapa 2, tal como salió
  acta_revisada jsonb,                                 -- lo que Jhojan corrige y aprueba
  modelo text,                                         -- con qué modelo se procesó
  aprobada_por uuid references public.perfiles (id),
  aprobada_en timestamptz,
  formato_id uuid unique references public.sst_formatos (id),   -- el acta para firmar (motor de plantillas)
  anulada_por uuid references public.perfiles (id),
  anulada_en timestamptz,
  motivo_anulacion text,
  creada_por uuid not null default auth.uid() references public.perfiles (id),
  creada_en timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reuniones_asistentes check (jsonb_typeof(asistentes) = 'array'),
  constraint reuniones_aviso check (not aviso_grabacion or (aviso_por is not null and aviso_en is not null)),
  constraint reuniones_audio_con_aviso check ((audio_path is null and transcripcion is null) or aviso_grabacion),
  constraint reuniones_anulada check (estado <> 'anulada' or length(trim(coalesce(motivo_anulacion, ''))) > 0)
);
create index if not exists idx_reuniones_proyecto on public.reuniones (proyecto_id, fecha desc);

create or replace function public.fn_reuniones_reglas()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if current_user in ('postgres', 'supabase_admin') then return old; end if;
    raise exception 'Una reunión no se borra: se anula con motivo.';
  end if;
  if current_user in ('postgres', 'supabase_admin') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.creada_por := auth.uid();
    new.creada_en := now();
    new.estado := 'preparando';
    new.aprobada_por := null; new.aprobada_en := null; new.formato_id := null;
    new.anulada_por := null; new.anulada_en := null; new.motivo_anulacion := null;
    new.audio_descartado_en := null; new.audio_descartado_por := null;
    if new.aviso_grabacion then
      if jsonb_array_length(new.asistentes) = 0 then
        raise exception 'Anota quiénes estaban cuando avisaste que se iba a grabar.';
      end if;
      new.aviso_por := auth.uid();
      new.aviso_en := now();
    else
      new.aviso_por := null; new.aviso_en := null;
    end if;
    return new;
  end if;

  -- UPDATE
  if old.estado = 'anulada' then
    raise exception 'La reunión está anulada: no cambia.';
  end if;
  if (new.proyecto_id, new.creada_por, new.creada_en) is distinct from (old.proyecto_id, old.creada_por, old.creada_en) then
    raise exception 'La obra y quién creó la reunión no se cambian.';
  end if;

  -- El aviso: se da una vez y no se deshace; quién y cuándo los pone la base.
  if old.aviso_grabacion then
    if (new.aviso_grabacion, new.aviso_por, new.aviso_en, new.asistentes)
       is distinct from (old.aviso_grabacion, old.aviso_por, old.aviso_en, old.asistentes) then
      raise exception 'El aviso de grabación ya quedó registrado (quién avisó, cuándo y quiénes estaban): no se cambia.';
    end if;
  elsif new.aviso_grabacion then
    if jsonb_array_length(new.asistentes) = 0 then
      raise exception 'Anota quiénes estaban cuando avisaste que se iba a grabar.';
    end if;
    new.aviso_por := auth.uid();
    new.aviso_en := now();
  elsif (new.aviso_por, new.aviso_en) is distinct from (old.aviso_por, old.aviso_en) then
    raise exception 'El aviso de grabación lo registra la base.';
  end if;

  -- El audio se registra una vez.
  if old.audio_path is not null and (new.audio_path, new.audio_mime, new.audio_bytes) is distinct from (old.audio_path, old.audio_mime, old.audio_bytes) then
    raise exception 'El audio de la reunión ya quedó registrado: no se reemplaza.';
  end if;
  if new.audio_path is not null and new.audio_path not like old.id::text || '/%' then
    raise exception 'El audio no corresponde a esta reunión.';
  end if;
  if (new.audio_descartado_en, new.audio_descartado_por, new.audio_descartable_desde)
     is distinct from (old.audio_descartado_en, old.audio_descartado_por, old.audio_descartable_desde) then
    raise exception 'La retención del audio todavía no está definida: no se marca ni se descarta.';
  end if;

  -- Aprobada: el contenido queda fijo. Solo se enlaza el formato para firmar (una vez) o se anula.
  if old.estado = 'aprobada' then
    if (new.titulo, new.lugar, new.fecha, new.transcripcion, new.acta, new.acta_revisada, new.aprobada_por, new.aprobada_en, new.modelo)
       is distinct from (old.titulo, old.lugar, old.fecha, old.transcripcion, old.acta, old.acta_revisada, old.aprobada_por, old.aprobada_en, old.modelo) then
      raise exception 'El acta ya está aprobada: no se edita.';
    end if;
    if new.formato_id is distinct from old.formato_id and old.formato_id is not null then
      raise exception 'El acta ya tiene su documento para firmar.';
    end if;
    if new.estado = 'anulada' then
      if not fn_tiene_permiso('proyectos', 'responsable') then
        raise exception 'Solo el responsable de Proyectos anula una reunión aprobada.';
      end if;
    elsif new.estado <> 'aprobada' then
      raise exception 'Una reunión aprobada no vuelve a "%".', new.estado;
    end if;
  elsif new.formato_id is distinct from old.formato_id then
    raise exception 'El documento para firmar se arma cuando el acta esté aprobada.';
  end if;

  if new.estado is distinct from old.estado then
    if new.estado = 'aprobada' then
      if not fn_tiene_permiso('proyectos', 'responsable') then
        raise exception 'Aprobar el acta lo hace el responsable de Proyectos.';
      end if;
      if new.acta_revisada is null or jsonb_typeof(new.acta_revisada) <> 'object' then
        raise exception 'No hay acta para aprobar todavía.';
      end if;
      new.aprobada_por := auth.uid();
      new.aprobada_en := now();
    elsif new.estado = 'anulada' then
      if length(trim(coalesce(new.motivo_anulacion, ''))) = 0 then
        raise exception 'Escribe por qué se anula la reunión.';
      end if;
      new.anulada_por := auth.uid();
      new.anulada_en := now();
    elsif new.estado not in ('preparando', 'audio_subido', 'transcribiendo', 'redactando', 'lista', 'error') then
      raise exception 'Una reunión no pasa de "%" a "%".', old.estado, new.estado;
    end if;
  end if;
  if new.estado <> 'aprobada' and (new.aprobada_por, new.aprobada_en) is distinct from (old.aprobada_por, old.aprobada_en) then
    raise exception 'La aprobación la registra la base.';
  end if;
  if new.estado <> 'anulada' and (new.anulada_por, new.anulada_en, new.motivo_anulacion) is distinct from (old.anulada_por, old.anulada_en, old.motivo_anulacion) then
    raise exception 'La anulación la registra la base.';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_reuniones_reglas on public.reuniones;
create trigger trg_reuniones_reglas
  before insert or update or delete on public.reuniones
  for each row execute function public.fn_reuniones_reglas();
drop trigger if exists trg_reuniones_updated_at on public.reuniones;
create trigger trg_reuniones_updated_at
  before update on public.reuniones
  for each row execute function extensions.moddatetime(updated_at);

-- ============================================================ 2) compromisos → tareas
create table if not exists public.reunion_tareas (
  reunion_id uuid not null references public.reuniones (id),
  indice int not null check (indice >= 0),             -- posición del compromiso en acta_revisada.compromisos
  tarea_id uuid not null unique references public.tareas (id),
  creado_por uuid not null default auth.uid() references public.perfiles (id),
  creado_en timestamptz not null default now(),
  primary key (reunion_id, indice)
);

create or replace function public.fn_reunion_tareas_reglas()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('postgres', 'supabase_admin') then
    return coalesce(new, old);
  end if;
  if tg_op <> 'INSERT' then
    raise exception 'Lo que se volvió tarea queda anotado: no se cambia ni se borra.';
  end if;
  if not exists (select 1 from reuniones r where r.id = new.reunion_id and r.estado = 'aprobada'
                   and new.indice < jsonb_array_length(coalesce(r.acta_revisada -> 'compromisos', '[]'::jsonb))) then
    raise exception 'Los compromisos se vuelven tareas cuando el acta está aprobada.';
  end if;
  if not exists (select 1 from tareas t where t.id = new.tarea_id) then
    raise exception 'No se encontró la tarea.';
  end if;
  new.creado_por := auth.uid();
  new.creado_en := now();
  return new;
end;
$$;
drop trigger if exists trg_reunion_tareas_reglas on public.reunion_tareas;
create trigger trg_reunion_tareas_reglas
  before insert or update or delete on public.reunion_tareas
  for each row execute function public.fn_reunion_tareas_reglas();

-- ============================================================ 3) quién ve y quién hace
alter table public.reuniones enable row level security;
alter table public.reunion_tareas enable row level security;
revoke all on table public.reuniones, public.reunion_tareas from anon;
grant select, insert, update on table public.reuniones to authenticated;
grant select, insert on table public.reunion_tareas to authenticated;
drop policy if exists reuniones_select on public.reuniones;
create policy reuniones_select on public.reuniones for select to authenticated using (fn_tiene_permiso('proyectos', 'consultar'));
drop policy if exists reuniones_insert on public.reuniones;
create policy reuniones_insert on public.reuniones for insert to authenticated with check (fn_tiene_permiso('proyectos', 'trabajar'));
drop policy if exists reuniones_update on public.reuniones;
create policy reuniones_update on public.reuniones for update to authenticated
  using (fn_tiene_permiso('proyectos', 'trabajar')) with check (fn_tiene_permiso('proyectos', 'trabajar'));
drop policy if exists reunion_tareas_select on public.reunion_tareas;
create policy reunion_tareas_select on public.reunion_tareas for select to authenticated using (fn_tiene_permiso('proyectos', 'consultar'));
drop policy if exists reunion_tareas_insert on public.reunion_tareas;
create policy reunion_tareas_insert on public.reunion_tareas for insert to authenticated with check (fn_tiene_permiso('proyectos', 'trabajar'));

-- ============================================================ 4) el audio (bucket privado, subida directa)
-- 50 MB: el tope de un archivo en el plan de Supabase. La grabación del ERP va a 32 kbps (~15 MB por hora).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('reuniones', 'reuniones', false, 52428800,
        array['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/x-m4a', 'audio/m4a', 'audio/aac', 'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'video/webm'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- {reunion_id}/archivo: solo con el aviso dado, mientras no tenga audio, y sin reemplazar.
create or replace function public.fn_reunion_audio_subible(p_nombre text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select fn_tiene_permiso('proyectos', 'trabajar')
     and exists (select 1 from reuniones r where r.id::text = (storage.foldername(p_nombre))[1]
                   and r.aviso_grabacion and r.audio_path is null and r.estado in ('preparando', 'error'));
$$;
revoke all on function public.fn_reunion_audio_subible(text) from public, anon;
grant execute on function public.fn_reunion_audio_subible(text) to authenticated;
drop policy if exists reuniones_audio_select on storage.objects;
create policy reuniones_audio_select on storage.objects for select to authenticated
  using (bucket_id = 'reuniones' and fn_tiene_permiso('proyectos', 'consultar'));
drop policy if exists reuniones_audio_insert on storage.objects;
create policy reuniones_audio_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'reuniones' and fn_reunion_audio_subible(name));
-- Sin reemplazar ni borrar (el descarte del audio espera el plazo de retención).

-- ============================================================ 5) la plantilla "Acta de reunión" (motor de la 85)
-- La estructura es la del prompt 02_acta.md de la app de Jhojan, campo por campo; no se agrega
-- texto propio. Publicada para que se pueda firmar; si Jhojan la quiere distinta, crea una versión.
insert into public.sst_plantillas (id, ambito, codigo, nombre, version, descripcion, estado, publicada_en, campos, firmas)
values (
  '00000000-0000-4000-8000-0000000086a1', 'proyectos', 'PRY-ACTA-REUNION', 'Acta de reunión', 1,
  'Sale de una reunión grabada (Proyectos → Reuniones): la transcribe y redacta la IA y la revisa y aprueba Jhojan antes de firmarse.',
  'publicada', now(),
  '[
    {"id": "aviso_grabacion", "tipo": "texto_largo", "etiqueta": "Aviso de grabación"},
    {"id": "titulo", "tipo": "texto", "etiqueta": "Reunión", "obligatorio": true},
    {"id": "cliente", "tipo": "texto", "etiqueta": "Cliente"},
    {"id": "participantes", "tipo": "tabla", "etiqueta": "Participantes", "columnas": [
      {"id": "nombre", "tipo": "texto", "etiqueta": "Nombre"},
      {"id": "rol", "tipo": "texto", "etiqueta": "Rol"},
      {"id": "parte", "tipo": "lista", "etiqueta": "Parte", "opciones": ["servielectro", "cliente", "tercero"]}]},
    {"id": "resumen_ejecutivo", "tipo": "texto_largo", "etiqueta": "Resumen ejecutivo"},
    {"id": "temas", "tipo": "tabla", "etiqueta": "Temas tratados", "columnas": [
      {"id": "tema", "tipo": "texto", "etiqueta": "Tema"},
      {"id": "desarrollo", "tipo": "texto", "etiqueta": "Desarrollo"}]},
    {"id": "puntos_clave", "tipo": "texto_largo", "etiqueta": "Puntos clave"},
    {"id": "decisiones", "tipo": "texto_largo", "etiqueta": "Decisiones"},
    {"id": "conclusiones", "tipo": "texto_largo", "etiqueta": "Conclusiones"},
    {"id": "compromisos", "tipo": "tabla", "etiqueta": "Compromisos", "columnas": [
      {"id": "descripcion", "tipo": "texto", "etiqueta": "Compromiso"},
      {"id": "parte", "tipo": "lista", "etiqueta": "Parte", "opciones": ["servielectro", "cliente", "tercero"]},
      {"id": "responsable", "tipo": "texto", "etiqueta": "Responsable"},
      {"id": "fecha_limite", "tipo": "fecha", "etiqueta": "Fecha límite"}]},
    {"id": "pendientes_por_confirmar", "tipo": "texto_largo", "etiqueta": "Pendientes por confirmar"},
    {"id": "riesgos_u_objeciones", "tipo": "texto_largo", "etiqueta": "Riesgos y objeciones"},
    {"id": "oportunidades_comerciales", "tipo": "texto_largo", "etiqueta": "Oportunidades comerciales"},
    {"id": "inconsistencias", "tipo": "texto_largo", "etiqueta": "Inconsistencias detectadas"},
    {"id": "siguiente_reunion", "tipo": "texto", "etiqueta": "Próxima reunión"}
  ]'::jsonb,
  '[{"rol": "responsable_sst", "etiqueta": "Por Servielectro SAS", "obligatoria": true},
    {"rol": "sst_cliente", "etiqueta": "Por el cliente", "obligatoria": false}]'::jsonb
)
on conflict do nothing;
