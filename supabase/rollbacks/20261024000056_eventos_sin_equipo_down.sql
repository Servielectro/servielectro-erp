-- Deshace 20261024000056: vuelve a aceptar visibilidad "equipo" en eventos, con las
-- funciones y políticas tal como las dejó la 55. No borra datos.

alter table public.eventos drop constraint if exists eventos_visibilidad_check;
alter table public.eventos add constraint eventos_visibilidad_check
  check (visibilidad in ('interna', 'compartida', 'equipo'));

create or replace function public.fn_puede_ver_evento(p_evento_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from eventos e
    where e.id = p_evento_id
      and (e.creado_por = auth.uid()
           or (e.visibilidad = 'compartida' and fn_es_participante_evento(e.id))
           or (e.visibilidad = 'equipo' and fn_tiene_permiso('operativo', 'consultar')))
  );
$$;

create or replace function public.fn_eventos_reglas()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.todo_el_dia then
    new.inicio := ((new.inicio at time zone 'America/Bogota')::date)::timestamp at time zone 'America/Bogota';
    new.fin := ((new.fin at time zone 'America/Bogota')::date)::timestamp at time zone 'America/Bogota';
  end if;

  if tg_op = 'INSERT' then
    if current_user not in ('postgres', 'supabase_admin') then
      new.creado_por := auth.uid();
    end if;
    return new;
  end if;

  if current_user not in ('postgres', 'supabase_admin') then
    if new.creado_por is distinct from old.creado_por then
      raise exception 'No se cambia quién creó el evento.';
    end if;
    if new.visibilidad is distinct from old.visibilidad then
      if (new.visibilidad = 'equipo' or old.visibilidad = 'equipo') and not fn_tiene_permiso('operativo', 'trabajar') then
        raise exception 'Solo Operativo pasa un evento al equipo de obra o lo saca de ahí.';
      end if;
      if old.visibilidad = 'compartida' and fn_evento_tiene_participantes(new.id) then
        raise exception 'Quita a los participantes antes de cambiar con quién se comparte.';
      end if;
    end if;
  end if;

  if new.archivado and not old.archivado then
    new.archivado_en := now();
  elsif not new.archivado then
    new.archivado_en := null;
  end if;
  return new;
end;
$$;

drop policy if exists eventos_select on public.eventos;
create policy eventos_select on public.eventos for select to authenticated
  using (creado_por = auth.uid()
         or (visibilidad = 'compartida' and fn_es_participante_evento(id))
         or (visibilidad = 'equipo' and fn_tiene_permiso('operativo', 'consultar')));
drop policy if exists eventos_insert on public.eventos;
create policy eventos_insert on public.eventos for insert to authenticated
  with check (creado_por = auth.uid()
              and fn_tiene_permiso('planificacion', 'trabajar')
              and (visibilidad <> 'equipo' or fn_tiene_permiso('operativo', 'trabajar')));
drop policy if exists eventos_update on public.eventos;
create policy eventos_update on public.eventos for update to authenticated
  using (creado_por = auth.uid())
  with check (creado_por = auth.uid() and (visibilidad <> 'equipo' or fn_tiene_permiso('operativo', 'trabajar')));

revoke all on function public.fn_puede_ver_evento(uuid) from public, anon;
grant execute on function public.fn_puede_ver_evento(uuid) to authenticated, service_role;
revoke all on function public.fn_eventos_reglas() from public, anon, authenticated;
