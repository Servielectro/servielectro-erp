-- Los datos del contrato como registro con campos (2026-10-27). Base para el acta de inicio, el
-- acta de entrega y el cronograma.
--
-- Regla del orquestador: LA IA NO ESTÁ EN EL CAMINO DE UN DOCUMENTO QUE SE FIRMA. Un acta firmada
-- es prueba; si un modelo relee el contrato cada vez y parafrasea, salen actas cuyo texto no
-- coincide con el contrato (y el de Tintalá son 20 páginas escaneadas sin capa de texto: cada
-- lectura puede salir distinta). Por eso, como describirEquipoConIA:
--   1. La IA lee el contrato UNA vez y deja su PROPUESTA en `propuesta` (jsonb, con la página y la
--      cita de donde sacó cada campo). Eso es INFERIDO.
--   2. Una persona revisa y escribe/corrige las columnas de verdad (objeto, alcance, valor, forma
--      de pago, plazo, multa, garantías, pólizas exigidas) y CONFIRMA. Confirmar lo hace el
--      responsable de Proyectos o de Comercial.
--   3. Las actas y el cronograma se arman SOLO desde un contrato confirmado
--      (v_proyecto_contrato_vigente), nunca desde el PDF ni desde la propuesta.
-- Confirmado, no se edita: un cambio es un otrosí, que entra como una versión nueva
-- (reemplaza_id), se confirma igual y deja la anterior como "reemplazado". Un solo contrato
-- vigente por proyecto. Nada se borra.
--
-- Lo que aprendimos de Tintalá queda como regla: si la forma de pago trae porcentajes, tienen que
-- sumar 100 (la plantilla del Excel tenía filas ocultas que sumaban 130).
--
-- La plantilla del acta de inicio NO va aquí: falta el ejemplo de Jhojan. Esto es solo la
-- estructura. El proyecto CSE-26-151 sigue con el contrato resumido en su descripción hasta que
-- se cargue por aquí y se confirme.
--
-- Requiere la 90 (proyecto_documentos). Idempotente.
-- Verificación: supabase/verificaciones/20261121000093_verificar.sql
-- Rollback:     supabase/rollbacks/20261121000093_datos_del_contrato_down.sql

create table if not exists public.proyecto_contratos (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.proyectos (id) on delete restrict,
  documento_id uuid references public.proyecto_documentos (id) on delete restrict,   -- el contrato firmado
  reemplaza_id uuid references public.proyecto_contratos (id) on delete restrict,    -- otrosí
  numero text,                                        -- "CSE-26-151"
  estado text not null default 'inferido' check (estado in ('inferido', 'confirmado', 'reemplazado')),

  -- 1) Lo que propuso la IA (INFERIDO). Por campo: { "valor": …, "pagina": n, "cita": "texto literal" }.
  propuesta jsonb,
  propuesta_modelo text,
  propuesta_en timestamptz,

  -- 2) Lo que una persona revisó. Solo cuenta cuando estado = 'confirmado'.
  fecha_firma date,
  objeto text,
  alcance text,
  valor_total numeric(16,2) check (valor_total is null or valor_total >= 0),
  impuestos text,                                     -- "incluidos los impuestos aplicables…"
  anticipo_pct numeric(5,2) check (anticipo_pct is null or anticipo_pct between 0 and 100),
  -- [{ "concepto": "Anticipo", "porcentaje": 50, "valor": 8485267, "condicion": "a la aprobación de pólizas" }, …]
  forma_pago jsonb not null default '[]'::jsonb check (jsonb_typeof(forma_pago) = 'array'),
  plazo_cantidad int check (plazo_cantidad is null or plazo_cantidad > 0),
  plazo_unidad text check (plazo_unidad is null or plazo_unidad in ('dias_habiles', 'dias_calendario', 'semanas', 'meses')),
  plazo_inicia text check (plazo_inicia is null or plazo_inicia in ('acta_inicio', 'firma', 'anticipo', 'otro')),
  plazo_inicia_detalle text,
  multa_diaria numeric(14,2) check (multa_diaria is null or multa_diaria >= 0),
  multa_unidad text check (multa_unidad is null or multa_unidad in ('dia_habil', 'dia_calendario')),
  multa_tope_pct numeric(5,2) check (multa_tope_pct is null or multa_tope_pct between 0 and 100),
  -- [{ "concepto": "Mano de obra", "duracion": "12 meses", "desde": "acta de entrega" }, …]
  garantias jsonb not null default '[]'::jsonb check (jsonb_typeof(garantias) = 'array'),
  -- [{ "amparo": "Cumplimiento", "porcentaje": 30, "vigencia": "plazo + 6 meses" }, …]
  polizas_exigidas jsonb not null default '[]'::jsonb check (jsonb_typeof(polizas_exigidas) = 'array'),
  notas text,

  confirmado_por uuid references public.perfiles (id),
  confirmado_en timestamptz,
  creado_por uuid default auth.uid() references public.perfiles (id),
  creado_en timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint proyecto_contratos_confirmado check ((estado = 'inferido') = (confirmado_por is null))
);
create unique index if not exists uq_proyecto_contrato_vigente on public.proyecto_contratos (proyecto_id) where estado = 'confirmado';
create index if not exists idx_proyecto_contratos on public.proyecto_contratos (proyecto_id, creado_en desc);
drop trigger if exists trg_proyecto_contratos_updated_at on public.proyecto_contratos;
create trigger trg_proyecto_contratos_updated_at before update on public.proyecto_contratos
  for each row execute function extensions.moddatetime(updated_at);

-- ============================================================ funciones
-- Quién confirma: el responsable de Proyectos o de Comercial (hoy, Jhojan).
create or replace function public.fn_contrato_confirma()
returns boolean language sql stable security definer set search_path = public as $$
  select fn_tiene_permiso('proyectos', 'responsable') or fn_tiene_permiso('comercial', 'responsable');
$$;

-- Lecturas para el trigger: SIN filtro de permiso (regla de la 88).
create or replace function public.fn_contrato_documento_tipo(p_documento_id uuid, out tipo text, out proyecto_id uuid)
language sql stable security definer set search_path = public as $$
  select d.tipo, d.proyecto_id from proyecto_documentos d where d.id = p_documento_id and pg_trigger_depth() > 0;
$$;

create or replace function public.fn_proyecto_contratos_reglas()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_doc record;
  v_suma numeric;
  v_falta text[] := '{}';
begin
  if tg_op = 'DELETE' then
    if current_user in ('postgres', 'supabase_admin') then return old; end if;
    raise exception 'Un contrato no se borra: si cambió, se registra el otrosí como versión nueva.';
  end if;

  if new.documento_id is not null then
    select * into v_doc from fn_contrato_documento_tipo(new.documento_id);
    if v_doc.tipo is distinct from 'contrato_firmado' or v_doc.proyecto_id is distinct from new.proyecto_id then
      raise exception 'El documento del contrato tiene que ser un contrato firmado del mismo proyecto.';
    end if;
  end if;

  if tg_op = 'INSERT' then
    new.estado := 'inferido';
    new.confirmado_por := null;
    new.confirmado_en := null;
    if current_user not in ('postgres', 'supabase_admin', 'service_role') then
      new.creado_por := auth.uid();
    end if;
    new.creado_en := now();
    return new;
  end if;

  -- UPDATE
  if new.proyecto_id is distinct from old.proyecto_id or new.reemplaza_id is distinct from old.reemplaza_id
     or new.creado_por is distinct from old.creado_por or new.creado_en is distinct from old.creado_en then
    raise exception 'El proyecto, el contrato que reemplaza y quién lo creó no se cambian.';
  end if;

  if old.estado = 'confirmado' then
    -- Solo el otrosí, al confirmarse, lo pasa a "reemplazado" (desde su propio trigger).
    if new.estado = 'reemplazado' and pg_trigger_depth() > 1
       and (to_jsonb(new) - array['estado', 'updated_at']) = (to_jsonb(old) - array['estado', 'updated_at']) then
      return new;
    end if;
    raise exception 'El contrato confirmado no se edita: un cambio es un otrosí (versión nueva que lo reemplaza).';
  end if;
  if old.estado = 'reemplazado' then
    raise exception 'Este contrato fue reemplazado por un otrosí: no cambia.';
  end if;

  -- old.estado = 'inferido'
  if new.estado = 'reemplazado' then
    raise exception 'Un contrato sin confirmar no se reemplaza.';
  end if;
  if new.estado = 'inferido' then
    if new.confirmado_por is not null or new.confirmado_en is not null then
      raise exception 'La confirmación la registra la base al confirmar.';
    end if;
    return new;
  end if;

  -- inferido → confirmado
  if not fn_contrato_confirma() then
    raise exception 'Confirmar el contrato lo hace el responsable de Proyectos o de Comercial.';
  end if;
  if new.objeto is null or length(trim(new.objeto)) = 0 then v_falta := v_falta || 'objeto'; end if;
  if new.alcance is null or length(trim(new.alcance)) = 0 then v_falta := v_falta || 'alcance'; end if;
  if new.valor_total is null then v_falta := v_falta || 'valor total'; end if;
  if new.plazo_cantidad is null or new.plazo_unidad is null or new.plazo_inicia is null then v_falta := v_falta || 'plazo (cantidad, unidad y desde cuándo corre)'; end if;
  if new.documento_id is null then v_falta := v_falta || 'el contrato firmado (documento)'; end if;
  if array_length(v_falta, 1) > 0 then
    raise exception 'Para confirmar falta: %.', array_to_string(v_falta, ', ');
  end if;
  if new.plazo_inicia = 'otro' and length(trim(coalesce(new.plazo_inicia_detalle, ''))) = 0 then
    raise exception 'Escribe desde cuándo corre el plazo.';
  end if;
  select sum((x ->> 'porcentaje')::numeric) into v_suma
  from jsonb_array_elements(new.forma_pago) x where x ? 'porcentaje';
  if v_suma is not null and v_suma <> 100 then
    raise exception 'La forma de pago suma % %%: tiene que sumar 100 %%.', v_suma;
  end if;

  -- Un otrosí deja el anterior como reemplazado (antes de que este quede vigente).
  if new.reemplaza_id is not null then
    update proyecto_contratos set estado = 'reemplazado' where id = new.reemplaza_id and estado = 'confirmado';
  end if;
  new.confirmado_por := auth.uid();
  new.confirmado_en := now();
  return new;
end;
$$;
drop trigger if exists trg_proyecto_contratos_reglas on public.proyecto_contratos;
create trigger trg_proyecto_contratos_reglas before insert or update or delete on public.proyecto_contratos
  for each row execute function public.fn_proyecto_contratos_reglas();

-- De aquí, y solo de aquí, salen las actas y el cronograma.
create or replace view public.v_proyecto_contrato_vigente
with (security_invoker = true) as
select c.id as contrato_id, c.proyecto_id, c.numero, c.documento_id, c.fecha_firma, c.objeto, c.alcance,
       c.valor_total, c.impuestos, c.anticipo_pct, c.forma_pago, c.plazo_cantidad, c.plazo_unidad,
       c.plazo_inicia, c.plazo_inicia_detalle, c.multa_diaria, c.multa_unidad, c.multa_tope_pct,
       c.garantias, c.polizas_exigidas, c.confirmado_por, c.confirmado_en
from public.proyecto_contratos c
where c.estado = 'confirmado';

-- ============================================================ privilegios y RLS
alter table public.proyecto_contratos enable row level security;
revoke all on table public.proyecto_contratos from anon;
revoke delete, truncate, trigger, references on table public.proyecto_contratos from authenticated;
revoke all on table public.v_proyecto_contrato_vigente from anon;
drop policy if exists proyecto_contratos_select on public.proyecto_contratos;
create policy proyecto_contratos_select on public.proyecto_contratos for select to authenticated
  using (fn_tiene_permiso('proyectos', 'consultar') or fn_tiene_permiso('comercial', 'consultar'));
drop policy if exists proyecto_contratos_insert on public.proyecto_contratos;
create policy proyecto_contratos_insert on public.proyecto_contratos for insert to authenticated
  with check (fn_tiene_permiso('proyectos', 'trabajar') or fn_tiene_permiso('comercial', 'trabajar'));
drop policy if exists proyecto_contratos_update on public.proyecto_contratos;
create policy proyecto_contratos_update on public.proyecto_contratos for update to authenticated
  using (fn_tiene_permiso('proyectos', 'trabajar') or fn_tiene_permiso('comercial', 'trabajar'))
  with check (fn_tiene_permiso('proyectos', 'trabajar') or fn_tiene_permiso('comercial', 'trabajar'));

revoke all on function public.fn_contrato_confirma() from public, anon;
revoke all on function public.fn_contrato_documento_tipo(uuid) from public, anon;
grant execute on function public.fn_contrato_confirma() to authenticated, service_role;
grant execute on function public.fn_contrato_documento_tipo(uuid) to authenticated, service_role;
-- de trigger: nadie
revoke all on function public.fn_proyecto_contratos_reglas() from public, anon, authenticated;
