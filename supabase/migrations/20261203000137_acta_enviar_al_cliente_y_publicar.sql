-- Enviar un acta al cliente para firma, y publicarla sola cuando quede firmada.
--
-- Hueco que cierra: con la 0135, un acta en borrador con firma de contratante le
-- aparecía al cliente apenas se creaba, aunque adentro todavía se estuviera llenando.
-- Eso contradice "nada se expone por defecto". Ahora hay un acto explícito: ENVIAR.
--
-- Circuito, verificado de punta a punta en producción (ver notas al final):
--   1. Adentro se llena el acta. En borrador, el cliente NO la ve.
--   2. "Enviar al cliente para firma" -> recién ahí le aparece. Se niega si faltan campos.
--   3. El cliente la lee y firma como contratante.
--   4. Al sellarse, el acta se publica sola al portal: queda para ambos, firmada.

alter table public.sst_formatos
  add column if not exists enviado_cliente_en  timestamptz,
  add column if not exists enviado_cliente_por uuid references auth.users(id);

create or replace function public.fn_sst_enviar_al_cliente(p_formato uuid)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare
  f record; v_falta text[]; v_tiene_firma_cliente boolean;
begin
  select ff.id, ff.estado, ff.ambito, ff.proyecto_id, ff.plantilla_id, ff.enviado_cliente_en
    into f from public.sst_formatos ff where ff.id = p_formato;
  if f.id is null then raise exception 'Ese formato no existe.'; end if;
  if not public.fn_plantillas_permiso(f.ambito, 'trabajar') then
    raise exception 'No tienes permiso para enviar formatos al cliente.'; end if;
  if f.estado <> 'borrador' then raise exception 'El acta ya está cerrada: no se envía.'; end if;
  if f.proyecto_id is null then
    raise exception 'El acta no está amarrada a un proyecto: no se sabe a qué cliente enviarla.'; end if;
  select pl.firmas @> '[{"rol":"sst_cliente"}]'::jsonb into v_tiene_firma_cliente
  from public.sst_plantillas pl where pl.id = f.plantilla_id;
  if not coalesce(v_tiene_firma_cliente, false) then
    raise exception 'Este formato no lleva firma del contratante.'; end if;
  -- No se le manda al cliente un acta a medio llenar.
  v_falta := public.fn_sst_faltantes(p_formato);
  if array_length(v_falta, 1) > 0 then
    raise exception 'Antes de enviarla al cliente falta llenar: %.', array_to_string(v_falta, ', '); end if;
  if f.enviado_cliente_en is not null then return f.enviado_cliente_en; end if;
  update public.sst_formatos set enviado_cliente_en = now(), enviado_cliente_por = auth.uid()
   where id = p_formato;
  return now();
end; $$;

create or replace function public.fn_sst_retirar_del_cliente(p_formato uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.fn_plantillas_permiso(
       (select ambito from public.sst_formatos where id = p_formato), 'trabajar') then
    raise exception 'No tienes permiso para retirar formatos del cliente.'; end if;
  if exists (select 1 from public.sst_formato_firmas s
              where s.formato_id = p_formato and s.rol = 'sst_cliente') then
    raise exception 'El contratante ya firmó: el acta no se retira.'; end if;
  update public.sst_formatos set enviado_cliente_en = null, enviado_cliente_por = null
   where id = p_formato and estado = 'borrador';
end; $$;

create or replace function public.fn_cliente_ve_formato(p_formato uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.fn_cliente_actual() is not null
     and exists (
       select 1 from public.sst_formatos f
       join public.proyectos p on p.id = f.proyecto_id
       where f.id = p_formato
         and p.cliente_id = public.fn_cliente_actual()
         and (
           exists (select 1 from public.cliente_portal_documentos d
                    where d.formato_id = f.id and d.retirado_en is null)
           or (f.estado = 'borrador'
               and f.enviado_cliente_en is not null
               and exists (select 1 from public.sst_plantillas pl
                            where pl.id = f.plantilla_id
                              and pl.firmas @> '[{"rol":"sst_cliente"}]'::jsonb))
         )
     );
$$;

drop view if exists public.v_cliente_por_firmar;
create view public.v_cliente_por_firmar as
select f.id as formato_id, pl.codigo, pl.nombre as formato, f.fecha, f.proyecto_id,
       p.codigo as proyecto_codigo, f.estado, f.enviado_cliente_en,
       exists (select 1 from public.sst_formato_firmas s
                where s.formato_id = f.id and s.rol = 'sst_cliente') as ya_firmado
from public.sst_formatos f
join public.sst_plantillas pl on pl.id = f.plantilla_id
join public.proyectos p on p.id = f.proyecto_id
where f.estado = 'borrador'
  and f.enviado_cliente_en is not null
  and p.cliente_id = public.fn_cliente_actual() and public.fn_cliente_actual() is not null
  and pl.firmas @> '[{"rol":"sst_cliente"}]'::jsonb;

grant select on public.v_cliente_por_firmar to authenticated;

create or replace function public.fn_sst_acta_publicar_al_cerrar()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_nombre text;
begin
  if new.estado not in ('firmado','aprobado') or old.estado = new.estado then return new; end if;
  if new.proyecto_id is null then return new; end if;
  if not exists (select 1 from public.sst_plantillas pl
                  where pl.id = new.plantilla_id
                    and pl.firmas @> '[{"rol":"sst_cliente"}]'::jsonb) then return new; end if;
  select pl.nombre into v_nombre from public.sst_plantillas pl where pl.id = new.plantilla_id;
  insert into public.cliente_portal_documentos
    (proyecto_id, categoria, titulo, descripcion, formato_id, publicado_por)
  select new.proyecto_id, 'acta',
         coalesce(v_nombre, 'Acta') || ' · ' || to_char(new.fecha, 'DD/MM/YYYY'),
         'Publicada automáticamente al quedar firmada.',
         new.id, coalesce(new.creado_por, auth.uid())
  where not exists (select 1 from public.cliente_portal_documentos d where d.formato_id = new.id);
  return new;
end; $$;

revoke all on function public.fn_sst_acta_publicar_al_cerrar() from public, anon, authenticated;

drop trigger if exists sst_formatos_publicar_acta on public.sst_formatos;
create trigger sst_formatos_publicar_acta
  after update of estado on public.sst_formatos
  for each row execute function public.fn_sst_acta_publicar_al_cerrar();

revoke all on function public.fn_sst_enviar_al_cliente(uuid)   from public, anon;
revoke all on function public.fn_sst_retirar_del_cliente(uuid) from public, anon;
grant execute on function public.fn_sst_enviar_al_cliente(uuid)   to authenticated;
grant execute on function public.fn_sst_retirar_del_cliente(uuid) to authenticated;

comment on column public.sst_formatos.enviado_cliente_en is
  'Cuándo se envió el acta al portal del cliente para su firma. Mientras sea NULL, el cliente no la ve.';

-- Verificado contra producción (y revertido entero) con el acta de Tintalá y un perfil
-- forzado a tener solo el rol Cliente:
--   antes de enviar, el cliente ve      0 actas
--   enviar con campo faltante           rechazó: "falta llenar: Inicio de labores"
--   Jhojan la envía                     OK
--   después de enviar, el cliente ve    1 acta
--   el cliente firma como contratante   OK
--   firma Servielectro y se sella       OK
--   el cliente ve el acta publicada     1 documento
--   ya no le aparece como pendiente     0
