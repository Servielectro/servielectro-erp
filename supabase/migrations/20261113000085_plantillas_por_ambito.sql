-- Migración 85: el motor de plantillas de SG-SST (75), también para las actas de Proyectos (2026-10-27).
--
-- Pedido de Jhojan el día que arrancó una obra: "las plantillas de las actas… el acta de inicio
-- con firmas… actas de reuniones con firmas". Un acta es lo mismo que un formato de SG-SST: campos
-- que arma el usuario, fotos, firmas, sellado con la primera firma, integridad y PDF. No se hace un
-- segundo armador: el mismo motor, con ÁMBITO.
--
--   - sst_plantillas y sst_formatos ganan `ambito` ('sgsst' | 'proyectos'). Lo existente queda
--     'sgsst' (el valor por defecto): ni una fila cambia.
--   - El ámbito de un formato lo pone la base desde su plantilla (no lo manda el celular), y no
--     cambia. Una versión nueva de una plantilla hereda el ámbito de la anterior.
--   - Permisos según el ámbito (fn_plantillas_permiso): 'sgsst' contra el módulo sgsst, como hoy;
--     'proyectos' contra el módulo proyectos (armar = responsable, llenar = trabajar, ver =
--     consultar). Ni una cosa ve la otra: tablas, fotos, firmas, hash, integridad y archivos.
--   - En ámbito proyectos la obra (proyecto_id) es obligatoria.
--   - Los roles de firma no cambian en la base (tecnico | responsable_sst | sst_cliente | otro);
--     la pantalla de Proyectos los nombra "Técnicos / Representante de Servielectro / Representante
--     del cliente / Otro". La lista de técnicos en obra (migración 83) sirve igual.
--   - El hash del contenido NO incluye el ámbito: los formatos ya sellados siguen íntegros.
--   - Los nombres sst_* se quedan (renombrar tablas en producción se habla antes).
--   - fn_sst_personal (solo nombres y cargo, para la lista de técnicos) también para Proyectos.
--
-- Depende de la 83 (hash y lista de técnicos). Verificación: supabase/verificaciones/20261113000085_verificar.sql
-- Rollback: supabase/rollbacks/20261113000085_plantillas_por_ambito_down.sql. Idempotente.

-- ============================================================ 1) el ámbito
alter table public.sst_plantillas add column if not exists ambito text not null default 'sgsst';
alter table public.sst_plantillas drop constraint if exists sst_plantillas_ambito;
alter table public.sst_plantillas add constraint sst_plantillas_ambito check (ambito in ('sgsst', 'proyectos'));
alter table public.sst_formatos add column if not exists ambito text not null default 'sgsst';
alter table public.sst_formatos drop constraint if exists sst_formatos_ambito;
alter table public.sst_formatos add constraint sst_formatos_ambito check (ambito in ('sgsst', 'proyectos'));
alter table public.sst_formatos drop constraint if exists sst_formatos_obra_en_proyectos;
alter table public.sst_formatos add constraint sst_formatos_obra_en_proyectos check (ambito <> 'proyectos' or proyecto_id is not null);
create index if not exists idx_sst_plantillas_ambito on public.sst_plantillas (ambito, estado);
create index if not exists idx_sst_formatos_ambito on public.sst_formatos (ambito, proyecto_id, fecha desc);

-- ¿Tiene ese nivel en el módulo de ese ámbito?
create or replace function public.fn_plantillas_permiso(p_ambito text, p_nivel nivel_permiso)
returns boolean
language sql
stable
set search_path = public
as $$
  select case p_ambito
    when 'sgsst' then fn_tiene_permiso('sgsst', p_nivel)
    when 'proyectos' then fn_tiene_permiso('proyectos', p_nivel)
    else false
  end;
$$;
revoke all on function public.fn_plantillas_permiso(text, nivel_permiso) from public, anon;
grant execute on function public.fn_plantillas_permiso(text, nivel_permiso) to authenticated, service_role;

-- Quién "gestiona" en cada ámbito (para los mensajes).
create or replace function public.fn_plantillas_gestion(p_ambito text)
returns text
language sql
immutable
set search_path = public
as $$
  select case p_ambito when 'proyectos' then 'el responsable de Proyectos' else 'la gestión SST' end;
$$;

-- El ámbito de un formato, sin depender de lo que ve quien consulta (lo usan políticas y archivos).
create or replace function public.fn_sst_formato_ambito(p_formato_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select ambito from sst_formatos where id = p_formato_id;
$$;
revoke all on function public.fn_sst_formato_ambito(uuid) from public, anon;
grant execute on function public.fn_sst_formato_ambito(uuid) to authenticated, service_role;

-- La plantilla: el ámbito se elige al crearla (o se hereda de la versión anterior) y no cambia.
create or replace function public.fn_sst_plantilla_ambito()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.plantilla_anterior_id is not null then
      new.ambito := coalesce((select ambito from sst_plantillas where id = new.plantilla_anterior_id), new.ambito);
    end if;
  elsif new.ambito is distinct from old.ambito then
    raise exception 'El ámbito de una plantilla no cambia.';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_sst_plantilla_ambito on public.sst_plantillas;
create trigger trg_sst_plantilla_ambito
  before insert or update on public.sst_plantillas
  for each row execute function public.fn_sst_plantilla_ambito();

-- El formato: su ámbito es el de su plantilla (lo pone la base) y no cambia.
create or replace function public.fn_sst_formato_ambito_regla()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.ambito := coalesce((select ambito from sst_plantillas where id = new.plantilla_id), new.ambito);
    if new.ambito = 'proyectos' and new.proyecto_id is null then
      raise exception 'Un acta de Proyectos va con su obra: elige el proyecto.';
    end if;
  elsif new.ambito is distinct from old.ambito then
    raise exception 'El ámbito de un formato no cambia.';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_sst_formato_ambito on public.sst_formatos;
create trigger trg_sst_formato_ambito
  before insert or update on public.sst_formatos
  for each row execute function public.fn_sst_formato_ambito_regla();
revoke all on function public.fn_sst_plantilla_ambito() from public, anon, authenticated;
revoke all on function public.fn_sst_formato_ambito_regla() from public, anon, authenticated;

-- ============================================================ 2) reglas del formato (las de la 75, con el permiso por ámbito)
create or replace function public.fn_sst_formato_reglas()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_firmado boolean;
  v_falta text;
begin
  if tg_op = 'DELETE' then
    if current_user in ('postgres', 'supabase_admin') then return old; end if;
    raise exception 'Los formatos de SST no se borran: se anulan con motivo.';
  end if;
  if current_user in ('postgres', 'supabase_admin') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if not exists (select 1 from sst_plantillas p where p.id = new.plantilla_id and p.estado = 'publicada') then
      raise exception 'Solo se llenan plantillas publicadas.';
    end if;
    new.estado := 'borrador';
    new.creado_por := auth.uid();
    new.creado_en := now();
    new.sellado_en := null; new.hash_contenido := null;
    new.aprobado_por := null; new.aprobado_en := null;
    new.anulado_por := null; new.anulado_en := null; new.motivo_anulacion := null;
    return new;
  end if;

  -- UPDATE
  if old.estado = 'anulado' then
    raise exception 'El formato está anulado: no cambia.';
  end if;
  if (new.creado_por, new.creado_en) is distinct from (old.creado_por, old.creado_en) then
    raise exception 'Quién y cuándo lo creó no se cambia.';
  end if;
  v_firmado := fn_sst_formato_tiene_firmas(old.id);
  if (new.plantilla_id, new.proyecto_id, new.cliente_id, new.lugar, new.fecha, new.respuestas)
     is distinct from (old.plantilla_id, old.proyecto_id, old.cliente_id, old.lugar, old.fecha, old.respuestas) then
    if v_firmado or old.estado <> 'borrador' then
      raise exception 'El formato ya tiene firmas: su contenido quedó sellado y no se edita.';
    end if;
    if old.plantilla_id is distinct from new.plantilla_id then
      raise exception 'La plantilla de un formato no se cambia.';
    end if;
    if old.creado_por <> auth.uid() and not fn_plantillas_permiso(old.ambito, 'responsable') then
      raise exception 'Solo quien lo creó edita el formato (o %).', fn_plantillas_gestion(old.ambito);
    end if;
  end if;

  if new.estado is distinct from old.estado then
    if old.estado = 'borrador' and new.estado = 'firmado' then
      -- Cerrar: todas las firmas obligatorias de la plantilla.
      select string_agg(x ->> 'etiqueta', ', ') into v_falta
      from sst_plantillas p, jsonb_array_elements(p.firmas) x
      where p.id = old.plantilla_id
        and coalesce((x ->> 'obligatoria')::boolean, true)
        and not exists (select 1 from sst_formato_firmas s where s.formato_id = old.id and s.rol = x ->> 'rol');
      if v_falta is not null then
        raise exception 'Faltan firmas para cerrarlo: %.', v_falta;
      end if;
      new.sellado_en := now();
      new.hash_contenido := fn_sst_hash_formato(old.id);
    elsif old.estado = 'firmado' and new.estado = 'aprobado' then
      if not fn_plantillas_permiso(old.ambito, 'responsable') then
        raise exception 'Solo % aprueba formatos.', fn_plantillas_gestion(old.ambito);
      end if;
      new.aprobado_por := auth.uid();
      new.aprobado_en := now();
    elsif new.estado = 'anulado' then
      if not fn_plantillas_permiso(old.ambito, 'responsable') then
        raise exception 'Solo % anula formatos.', fn_plantillas_gestion(old.ambito);
      end if;
      if length(trim(coalesce(new.motivo_anulacion, ''))) = 0 then
        raise exception 'Escribe por qué se anula el formato.';
      end if;
      new.anulado_por := auth.uid();
      new.anulado_en := now();
    else
      raise exception 'Un formato no pasa de "%" a "%".', old.estado, new.estado;
    end if;
  end if;
  if new.estado is not distinct from old.estado
     and (new.sellado_en, new.hash_contenido, new.aprobado_por, new.aprobado_en, new.anulado_por, new.anulado_en, new.motivo_anulacion)
         is distinct from (old.sellado_en, old.hash_contenido, old.aprobado_por, old.aprobado_en, old.anulado_por, old.anulado_en, old.motivo_anulacion) then
    raise exception 'El sello, la aprobación y la anulación los pone la base.';
  end if;
  return new;
end;
$$;

-- ============================================================ 3) hash, integridad y lista de técnicos (por ámbito)
-- El hash es el de la 83, igual (sin el ámbito: lo sellado sigue íntegro); solo cambia quién lo calcula.
create or replace function public.fn_sst_hash_formato(p_formato_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select encode(sha256(convert_to((jsonb_build_object(
    'plantilla', f.plantilla_id,
    'proyecto', f.proyecto_id,
    'cliente', f.cliente_id,
    'lugar', f.lugar,
    'fecha', f.fecha,
    'respuestas', f.respuestas,
    'archivos', coalesce((select jsonb_agg(jsonb_build_array(a.campo_id, a.sha256) order by a.path)
                          from sst_formato_archivos a where a.formato_id = f.id), '[]'::jsonb)
  ) || case when f.tecnicos_en_obra is null then '{}'::jsonb
            else jsonb_build_object('tecnicos_en_obra', f.tecnicos_en_obra) end)::text, 'UTF8')), 'hex')
  from sst_formatos f
  where f.id = p_formato_id
    and fn_plantillas_permiso(f.ambito, 'consultar');
$$;

create or replace function public.fn_sst_formato_integro(p_formato_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select f.hash_contenido is not null
     and f.hash_contenido = fn_sst_hash_formato(f.id)
     and not exists (select 1 from sst_formato_firmas x where x.formato_id = f.id and x.hash_contenido <> f.hash_contenido)
  from sst_formatos f
  where f.id = p_formato_id and fn_plantillas_permiso(f.ambito, 'consultar');
$$;

create or replace function public.fn_sst_tecnicos_de(p_formato_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select f.tecnicos_en_obra from sst_formatos f where f.id = p_formato_id and fn_plantillas_permiso(f.ambito, 'consultar');
$$;

create or replace function public.fn_sst_personal()
returns table (id uuid, perfil_id uuid, nombre text, cargo text, estado_laboral text)
language sql
stable
security definer
set search_path = public
as $$
  select e.id, e.perfil_id, trim(e.primer_nombre || ' ' || e.primer_apellido || coalesce(' ' || e.segundo_apellido, '')), e.cargo, e.estado_laboral
  from empleados e
  where fn_tiene_permiso('sgsst', 'consultar') or fn_tiene_permiso('proyectos', 'consultar')
  order by 3;
$$;

-- ============================================================ 4) políticas por ámbito
drop policy if exists sst_plantillas_select on public.sst_plantillas;
create policy sst_plantillas_select on public.sst_plantillas for select to authenticated
  using (fn_plantillas_permiso(ambito, 'consultar'));
drop policy if exists sst_plantillas_insert on public.sst_plantillas;
create policy sst_plantillas_insert on public.sst_plantillas for insert to authenticated
  with check (fn_plantillas_permiso(ambito, 'responsable'));
drop policy if exists sst_plantillas_update on public.sst_plantillas;
create policy sst_plantillas_update on public.sst_plantillas for update to authenticated
  using (fn_plantillas_permiso(ambito, 'responsable')) with check (fn_plantillas_permiso(ambito, 'responsable'));

drop policy if exists sst_formatos_select on public.sst_formatos;
create policy sst_formatos_select on public.sst_formatos for select to authenticated
  using (fn_plantillas_permiso(ambito, 'consultar'));
drop policy if exists sst_formatos_insert on public.sst_formatos;
create policy sst_formatos_insert on public.sst_formatos for insert to authenticated
  with check (fn_plantillas_permiso(ambito, 'trabajar'));
drop policy if exists sst_formatos_update on public.sst_formatos;
create policy sst_formatos_update on public.sst_formatos for update to authenticated
  using (fn_plantillas_permiso(ambito, 'trabajar')) with check (fn_plantillas_permiso(ambito, 'trabajar'));

drop policy if exists sst_formato_archivos_select on public.sst_formato_archivos;
create policy sst_formato_archivos_select on public.sst_formato_archivos for select to authenticated
  using (fn_plantillas_permiso(fn_sst_formato_ambito(formato_id), 'consultar'));
drop policy if exists sst_formato_archivos_insert on public.sst_formato_archivos;
create policy sst_formato_archivos_insert on public.sst_formato_archivos for insert to authenticated
  with check (fn_plantillas_permiso(fn_sst_formato_ambito(formato_id), 'trabajar'));
drop policy if exists sst_formato_firmas_select on public.sst_formato_firmas;
create policy sst_formato_firmas_select on public.sst_formato_firmas for select to authenticated
  using (fn_plantillas_permiso(fn_sst_formato_ambito(formato_id), 'consultar'));
drop policy if exists sst_formato_firmas_insert on public.sst_formato_firmas;
create policy sst_formato_firmas_insert on public.sst_formato_firmas for insert to authenticated
  with check (fn_plantillas_permiso(fn_sst_formato_ambito(formato_id), 'trabajar'));

-- ============================================================ 5) archivos (bucket sgsst): formatos/{id}/ según el ámbito
-- Lo de la 77, con la carpeta de formatos por ámbito. Plan, reportes y eventos siguen igual.
create or replace function public.fn_sst_archivo_subible(p_nombre text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case (storage.foldername(p_nombre))[1]
    when 'formatos' then exists (select 1 from sst_formatos f where f.id::text = (storage.foldername(p_nombre))[2]
                                 and f.estado = 'borrador' and fn_plantillas_permiso(f.ambito, 'trabajar'))
    when 'plan' then fn_tiene_permiso('sgsst', 'trabajar')
      and exists (select 1 from sst_plan_items i where i.id::text = (storage.foldername(p_nombre))[2] and i.archivado_en is null)
    when 'reportes' then exists (select 1 from sst_reportes_inseguros r where r.id::text = (storage.foldername(p_nombre))[2]
                                 and r.reportado_por = auth.uid() and r.estado = 'nuevo')
    when 'eventos' then fn_tiene_permiso('sgsst', 'trabajar')
      and exists (select 1 from sst_eventos e where e.id::text = (storage.foldername(p_nombre))[2] and e.estado in ('abierto', 'investigado'))
    else false
  end;
$$;
create or replace function public.fn_sst_archivo_visible(p_nombre text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case (storage.foldername(p_nombre))[1]
    when 'formatos' then exists (select 1 from sst_formatos f where f.id::text = (storage.foldername(p_nombre))[2]
                                 and fn_plantillas_permiso(f.ambito, 'consultar'))
    when 'reportes' then fn_tiene_permiso('sgsst', 'consultar')
      or exists (select 1 from sst_reportes_inseguros r where r.id::text = (storage.foldername(p_nombre))[2] and r.reportado_por = auth.uid())
    else fn_tiene_permiso('sgsst', 'consultar')
  end;
$$;
