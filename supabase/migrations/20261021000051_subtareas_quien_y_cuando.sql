-- Subtareas: hecha_por y hecha_en las llena la base.
--
-- En la 50 existían pero nadie las escribía: iban a quedar siempre nulas, y quien las
-- leyera creería que la subtarea no se marcó. Se llenan acá, al marcarla; al desmarcarla
-- vuelven a nulas (el historial, tarea_eventos, conserva igual quién la marcó y cuándo).
--
-- No es security definer: solo toca la fila que se está escribiendo.
--
-- ANOTADO, sin cambiar (ya corre y verificado): tareas.creada_por apunta a auth.users y
-- tarea_asignados.perfil_id a perfiles. Funciona porque perfiles.id = auth.users.id, pero
-- es inconsistente; unificarlo cuando haya otra razón para tocar esas columnas.
--
-- Rollback: supabase/rollbacks/20261021000051_subtareas_quien_y_cuando_down.sql
-- Idempotente.

create or replace function public.fn_subtarea_quien_y_cuando()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.hecha and (tg_op = 'INSERT' or not old.hecha) then
    new.hecha_por := auth.uid();
    new.hecha_en := now();
  elsif not new.hecha then
    new.hecha_por := null;
    new.hecha_en := null;
  elsif tg_op = 'UPDATE' then
    -- sigue hecha: no se reescribe quién ni cuándo
    new.hecha_por := old.hecha_por;
    new.hecha_en := old.hecha_en;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_subtarea_quien_y_cuando on public.tarea_subtareas;
create trigger trg_subtarea_quien_y_cuando before insert or update on public.tarea_subtareas
  for each row execute function public.fn_subtarea_quien_y_cuando();

-- ============================================================ privilegios de las funciones
-- AGREGADO DESPUÉS de correr esta migración, para que el archivo diga lo mismo que la base
-- (ver la 54, que lo aplica a todas): Postgres le da EXECUTE a PUBLIC a toda función nueva,
-- y revocar solo de anon NO alcanza. Se revoca de public y anon y se concede a quien la
-- necesita: authenticated (políticas, triggers que corren como el usuario, la app) y
-- service_role (traslado de fotos). Las de trigger no se conceden a nadie: Postgres revisa
-- EXECUTE al crear el trigger, no cuando se dispara.
-- de trigger: nadie
revoke all on function public.fn_subtarea_quien_y_cuando() from public, anon, authenticated;
