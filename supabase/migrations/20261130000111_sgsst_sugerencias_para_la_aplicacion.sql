-- "Sugerencias para la aplicación": el último submódulo de SG-SST, solo texto (2026-10-29).
-- Escrita y aplicada por el orquestador. Idempotente.
--
-- Jhojan: "quiero un submódulo que sea solo de texto en el módulo de SGSST. En la parte de abajo,
-- el último módulo, que se llame sugerencias para la aplicación, y que ahí sea un cuadro de texto
-- que vaya esta persona llenando y listo."
--
-- Esto NO reemplaza el módulo de notas de la 104 (reportes_problema con tipo / norma / gravedad /
-- triage). Ese se queda. Son dos cosas distintas a propósito:
--   - reportes_problema  = una observación formal sobre una pantalla, con su ruta capturada, su
--                          norma si es hallazgo, y un flujo de aceptar o descartar con razón.
--   - sgsst_sugerencias  = una libreta. Se escribe y ya.
-- Mezclarlas obligaría a Victoria a clasificar antes de poder anotar, y la fricción en el momento
-- de anotar es lo que hace que la gente no anote.
--
-- ------------------------------------------------------------------ por qué una nota por renglón
-- "Un cuadro de texto que vaya llenando" se podría hacer con UN solo campo largo que ella edita
-- todo el fin de semana. No se hizo así. Jhojan ya levantó este problema con el acta: "por si se
-- pierde la señal, se cierra la app o pierdo el proceso en el cel o tablet". Un textarea gigante
-- que guarda al final es justo lo que pierde el trabajo de una tarde.
--
-- Cada vez que le da guardar, la nota queda. En la pantalla ella ve una caja de texto y una lista
-- de lo que ya escribió: para ella sigue siendo "escribir y listo", pero nada se pierde a medias.
--
-- ------------------------------------------------------------------ lo que SÍ puede hacer
-- Editar sus propias notas (es una libreta, no un acta: corregir un typo no debería requerir
-- trámite) y quitarlas de la lista. Quitar ARCHIVA, no borra, y sin pedir motivo: Jhojan va a leer
-- esto para decidir mejoras, y una idea que ella descartó a medias puede seguir sirviendo.
-- Nadie edita las notas de otro, ni siquiera quien manda.

create table if not exists public.sgsst_sugerencias (
  id             uuid primary key default gen_random_uuid(),
  texto          text not null,
  creado_por     uuid not null default auth.uid() references public.perfiles (id),
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  archivada_en   timestamptz,
  constraint sgsst_sugerencias_texto check (length(trim(texto)) > 0)
);

create index if not exists idx_sgsst_sugerencias on public.sgsst_sugerencias (creado_en desc)
  where archivada_en is null;

comment on table public.sgsst_sugerencias is
  'Libreta de sugerencias sobre la aplicacion, dentro de SG-SST. Solo texto. Cada nota es de quien la escribio.';

-- ============================================================ reglas
-- NO definer: current_user es quien llama.
create or replace function public.fn_sgsst_sugerencias_reglas()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user in ('postgres', 'supabase_admin') then
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' then
    raise exception 'Una sugerencia no se borra: se quita de la lista y queda guardada.';
  end if;

  if tg_op = 'INSERT' then
    new.creado_por := auth.uid();
    new.creado_en := now();
    new.actualizado_en := now();
    new.archivada_en := null;
    return new;
  end if;

  -- UPDATE: solo su autor, y solo el texto o el archivar.
  if old.creado_por is distinct from auth.uid() then
    raise exception 'Cada quien edita sus propias sugerencias.';
  end if;
  if (new.creado_por, new.creado_en) is distinct from (old.creado_por, old.creado_en) then
    raise exception 'De quien es la nota y cuando se escribio no se cambian.';
  end if;
  new.actualizado_en := now();
  return new;
end;
$$;

drop trigger if exists trg_sgsst_sugerencias_reglas on public.sgsst_sugerencias;
create trigger trg_sgsst_sugerencias_reglas before insert or update or delete on public.sgsst_sugerencias
  for each row execute function public.fn_sgsst_sugerencias_reglas();

-- ============================================================ permisos
-- Las lee cualquiera con SG-SST (asi Jhojan las estudia sin plomeria extra); las escribe quien
-- trabaja en SG-SST, y solo a nombre propio.
alter table public.sgsst_sugerencias enable row level security;
revoke all on table public.sgsst_sugerencias from public, anon;
revoke truncate, trigger, references, delete on table public.sgsst_sugerencias from authenticated;
grant select, insert, update on table public.sgsst_sugerencias to authenticated;

drop policy if exists sgsst_sugerencias_select on public.sgsst_sugerencias;
create policy sgsst_sugerencias_select on public.sgsst_sugerencias for select to authenticated
  using (fn_tiene_permiso('sgsst', 'consultar'));

drop policy if exists sgsst_sugerencias_insert on public.sgsst_sugerencias;
create policy sgsst_sugerencias_insert on public.sgsst_sugerencias for insert to authenticated
  with check (fn_tiene_permiso('sgsst', 'trabajar') and creado_por = auth.uid());

drop policy if exists sgsst_sugerencias_update on public.sgsst_sugerencias;
create policy sgsst_sugerencias_update on public.sgsst_sugerencias for update to authenticated
  using (fn_tiene_permiso('sgsst', 'trabajar') and creado_por = auth.uid())
  with check (fn_tiene_permiso('sgsst', 'trabajar') and creado_por = auth.uid());

revoke all on function public.fn_sgsst_sugerencias_reglas() from public, anon, authenticated;
