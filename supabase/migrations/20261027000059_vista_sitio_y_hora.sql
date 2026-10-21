-- Base para la pantalla del coordinador (docs/2workers-detalle-visita-coordinador.md):
--
--   1) "Vista": cuándo el técnico abrió lo que le asignaron. Es el segundo hito de la línea de
--      tiempo Recibida · Vista · Check-in · Check-out.
--        - tarea_asignados.visto_en (por persona asignada: una tarea puede tener varios).
--        - visitas.visto_en: la línea de tiempo del coordinador es de la VISITA, y la visita se
--          asigna con visitas.tecnico_id, no con tarea_asignados. Sin esta columna, el hito
--          "Vista" de una visita no existiría. Si se reasigna a otro técnico, vuelve a nulo.
--      Nadie las escribe directo: tarea_asignados no tiene política de update, y en visitas el
--      técnico solo cambia el estado (fn_visitas_solo_estado_tecnico). Las marcan dos
--      funciones (security definer) que solo tocan la fila de quien llama, una sola vez:
--      fn_marcar_visita_vista y fn_marcar_tarea_vista. La primera vez queda; abrirla de nuevo
--      no la cambia.
--      Marcar "vista" en tarea_asignados NO escribe en el historial de la tarea (antes, todo
--      update de esa tabla se anotaba como "asignado" otra vez): la hora queda en visto_en.
--
--   2) Ubicación del sitio, puesta por quien asigna (enlace de Google Maps → lat/lng). NO es el
--      GPS del check-in/check-out de visita_jornadas: eso es evidencia de dónde estuvo el
--      técnico y no se toca ni se mezcla.
--        - visitas: sitio_lat, sitio_lng, sitio_url_maps. La dirección del sitio YA existe en
--          visitas.direccion (la llena crearVisita): no se agrega un sitio_direccion que la
--          duplique y deje dos direcciones distintas para el mismo sitio.
--        - tareas: sitio_direccion, sitio_lat, sitio_lng, sitio_url_maps (las tareas no tenían
--          dirección; sirve para las de obra que cuelgan de un proyecto y no de una visita).
--      Reglas: latitud y longitud van juntas (las dos o ninguna) y en rango; el enlace, si
--      viene, es https.
--
--   3) visitas.hora_programada: con fecha_programada da la hora de inicio programada, contra la
--      que se mide el RETRASO (check-in − programada). Sin fecha no hay hora.
--
-- Columnas nuevas, todas opcionales: nada de lo que ya existe cambia de comportamiento.
-- Idempotente.
-- Verificación: supabase/verificaciones/20261027000059_verificar.sql
-- Rollback:     supabase/rollbacks/20261027000059_vista_sitio_y_hora_down.sql

-- ============================================================ 1) columnas
alter table public.tarea_asignados add column if not exists visto_en timestamptz;

alter table public.visitas add column if not exists visto_en timestamptz;
alter table public.visitas add column if not exists hora_programada time;
alter table public.visitas add column if not exists sitio_lat numeric(9,6);
alter table public.visitas add column if not exists sitio_lng numeric(9,6);
alter table public.visitas add column if not exists sitio_url_maps text;

alter table public.tareas add column if not exists sitio_direccion text;
alter table public.tareas add column if not exists sitio_lat numeric(9,6);
alter table public.tareas add column if not exists sitio_lng numeric(9,6);
alter table public.tareas add column if not exists sitio_url_maps text;

-- ============================================================ 2) reglas de las columnas
alter table public.visitas drop constraint if exists visitas_hora_requiere_fecha;
alter table public.visitas add constraint visitas_hora_requiere_fecha
  check (hora_programada is null or fecha_programada is not null);

do $$
declare t text;
begin
  foreach t in array array['visitas', 'tareas'] loop
    execute format('alter table public.%I drop constraint if exists %I', t, t || '_sitio_coordenadas');
    execute format(
      'alter table public.%I add constraint %I check ('
      || '(sitio_lat is null) = (sitio_lng is null) '
      || 'and (sitio_lat is null or sitio_lat between -90 and 90) '
      || 'and (sitio_lng is null or sitio_lng between -180 and 180))',
      t, t || '_sitio_coordenadas');
    execute format('alter table public.%I drop constraint if exists %I', t, t || '_sitio_url_maps');
    execute format(
      'alter table public.%I add constraint %I check (sitio_url_maps is null or (sitio_url_maps ~ ''^https://'' and length(sitio_url_maps) <= 2000))',
      t, t || '_sitio_url_maps');
  end loop;
end $$;

-- ============================================================ 3) "vista": solo la fila propia, una vez
-- Devuelve cuándo quedó vista (la primera vez), o null si quien llama no es el técnico
-- asignado. No falla: abrir la visita no debe romper la app por esto.
create or replace function public.fn_marcar_visita_vista(p_visita_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare v timestamptz;
begin
  if auth.uid() is null then
    return null;
  end if;
  update visitas set visto_en = now()
  where id = p_visita_id and tecnico_id = auth.uid() and visto_en is null;
  select visto_en into v from visitas where id = p_visita_id and tecnico_id = auth.uid();
  return v;
end;
$$;

create or replace function public.fn_marcar_tarea_vista(p_tarea_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare v timestamptz;
begin
  if auth.uid() is null then
    return null;
  end if;
  update tarea_asignados set visto_en = now()
  where tarea_id = p_tarea_id and perfil_id = auth.uid() and visto_en is null;
  select visto_en into v from tarea_asignados where tarea_id = p_tarea_id and perfil_id = auth.uid();
  return v;
end;
$$;

revoke all on function public.fn_marcar_visita_vista(uuid) from public, anon;
revoke all on function public.fn_marcar_tarea_vista(uuid) from public, anon;
grant execute on function public.fn_marcar_visita_vista(uuid) to authenticated;
grant execute on function public.fn_marcar_tarea_vista(uuid) to authenticated;

-- Reasignar la visita a otro técnico: el nuevo todavía no la vio.
create or replace function public.fn_visita_reasignada()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.tecnico_id is distinct from old.tecnico_id then
    new.visto_en := null;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_visita_reasignada on public.visitas;
create trigger trg_visita_reasignada before update of tecnico_id on public.visitas
  for each row execute function public.fn_visita_reasignada();
revoke all on function public.fn_visita_reasignada() from public, anon, authenticated;

-- ============================================================ 4) historial: "vista" no es "asignado"
-- Igual a la versión de la migración 54, salvo el UPDATE de tarea_asignados (la única
-- columna que cambia ahí es visto_en): no se anota.
create or replace function public.fn_tarea_hijos_historial()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fila jsonb;      -- la fila afectada (la nueva, o la borrada)
  v_antes jsonb;     -- la fila anterior en un UPDATE
  v_accion text;
  v_tipo text;
  v_detalle jsonb;
begin
  if tg_op = 'DELETE' then
    v_fila := to_jsonb(old);
    v_accion := 'quitada';
  elsif tg_op = 'INSERT' then
    v_fila := to_jsonb(new);
    v_accion := 'agregada';
  else
    v_fila := to_jsonb(new);
    v_antes := to_jsonb(old);
    v_accion := 'editada';
  end if;

  if tg_table_name = 'tarea_asignados' then
    if tg_op = 'UPDATE' then
      return null;  -- migración 59: marcar "vista" (visto_en) no es una asignación nueva
    end if;
    v_tipo := 'asignacion';
    v_detalle := jsonb_build_object(
      'accion', case when tg_op = 'DELETE' then 'quitado' else 'asignado' end,
      'perfil_id', v_fila ->> 'perfil_id',
      'nombre', (select nombre from perfiles where id = (v_fila ->> 'perfil_id')::uuid));
  elsif tg_table_name = 'tarea_subtareas' then
    if tg_op = 'UPDATE' then
      if (v_fila -> 'hecha') = (v_antes -> 'hecha') and (v_fila -> 'titulo') = (v_antes -> 'titulo')
         and (v_fila -> 'responsable_id') is not distinct from (v_antes -> 'responsable_id') then
        return null;  -- solo cambió el orden
      end if;
      if (v_fila -> 'responsable_id') is distinct from (v_antes -> 'responsable_id') then
        v_accion := 'responsable';
      elsif (v_fila ->> 'hecha')::boolean and not (v_antes ->> 'hecha')::boolean then
        v_accion := 'hecha';
      elsif not (v_fila ->> 'hecha')::boolean and (v_antes ->> 'hecha')::boolean then
        v_accion := 'reabierta';
      end if;
    end if;
    v_tipo := 'subtarea';
    v_detalle := jsonb_build_object('accion', v_accion, 'titulo', v_fila ->> 'titulo',
      'responsable', coalesce((select nombre from perfiles where id = (v_fila ->> 'responsable_id')::uuid), 'Sin asignar'));
  else  -- tarea_dependencias
    v_tipo := 'dependencia';
    v_detalle := jsonb_build_object('accion', v_accion,
      'bloqueante_id', v_fila ->> 'bloqueante_id', 'tipo', v_fila ->> 'tipo');
  end if;

  insert into tarea_eventos (tarea_id, tipo, detalle, actor, actor_nombre)
  values ((v_fila ->> 'tarea_id')::uuid, v_tipo, v_detalle, auth.uid(), fn_nombre_actor());
  return null;
end;
$$;
revoke all on function public.fn_tarea_hijos_historial() from public, anon, authenticated;
