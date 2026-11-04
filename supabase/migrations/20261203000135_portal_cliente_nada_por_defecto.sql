-- Ajuste al portal del cliente (20261203000134): "nada se expone por defecto"
-- también para los formatos, y se rompe una recursión de políticas.
--
-- Problema 1. La 0134 dejaba al cliente ver TODOS los sst_formatos de su proyecto
-- solo por ser suyos. Probándolo con un usuario de cliente real se vio que alcanzaba
-- un formato de SG-SST (un ATS firmado) que nadie le había publicado. Un documento
-- interno hecho en sus instalaciones no es un documento que se le entregue.
--
-- Problema 2. Al apretar la política, las tres se referenciaban en círculo
-- (formatos -> plantillas -> formatos -> firmas) y Postgres devolvía
-- "infinite recursion detected in policy for relation sst_formatos".
-- Se rompe con funciones SECURITY DEFINER, que no vuelven a pasar por RLS.
--
-- Resultado: el cliente alcanza un formato únicamente si
--   a) se lo publicaron al portal, o
--   b) es un acta en borrador donde él tiene que firmar.

create or replace function public.fn_cliente_ve_formato(p_formato uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.fn_cliente_actual() is not null
     and exists (
       select 1
       from public.sst_formatos f
       join public.proyectos p on p.id = f.proyecto_id
       where f.id = p_formato
         and p.cliente_id = public.fn_cliente_actual()
         and (
           exists (select 1 from public.cliente_portal_documentos d
                    where d.formato_id = f.id and d.retirado_en is null)
           or (f.estado = 'borrador'
               and exists (select 1 from public.sst_plantillas pl
                            where pl.id = f.plantilla_id
                              and pl.firmas @> '[{"rol":"sst_cliente"}]'::jsonb))
         )
     );
$$;

revoke all on function public.fn_cliente_ve_formato(uuid) from public, anon;
grant execute on function public.fn_cliente_ve_formato(uuid) to authenticated;

create or replace function public.fn_cliente_ve_plantilla(p_plantilla uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.fn_cliente_actual() is not null
     and exists (
       select 1 from public.sst_formatos f
       where f.plantilla_id = p_plantilla
         and public.fn_cliente_ve_formato(f.id)
     );
$$;

revoke all on function public.fn_cliente_ve_plantilla(uuid) from public, anon;
grant execute on function public.fn_cliente_ve_plantilla(uuid) to authenticated;

drop policy if exists sst_formatos_select_cliente on public.sst_formatos;
create policy sst_formatos_select_cliente on public.sst_formatos
  for select to authenticated
  using (public.fn_cliente_ve_formato(id));

drop policy if exists sst_formato_firmas_select_cliente on public.sst_formato_firmas;
create policy sst_formato_firmas_select_cliente on public.sst_formato_firmas
  for select to authenticated
  using (public.fn_cliente_ve_formato(formato_id));

drop policy if exists sst_plantillas_select_cliente on public.sst_plantillas;
create policy sst_plantillas_select_cliente on public.sst_plantillas
  for select to authenticated
  using (public.fn_cliente_ve_plantilla(id));

drop policy if exists sst_formato_firmas_insert_cliente on public.sst_formato_firmas;
create policy sst_formato_firmas_insert_cliente on public.sst_formato_firmas
  for insert to authenticated
  with check (rol = 'sst_cliente' and public.fn_cliente_ve_formato(formato_id));

-- Verificado en producción con un perfil que tenía SOLO el rol Cliente:
--   proyectos (vista) 1 · proyectos (tabla) 0 · cotizaciones 0 · empleados 0
--   clientes 0 · items_catalogo 0 · persona_documentos 0 · visitas 0
--   formatos visibles 1 (solo el acta por firmar) · plantillas 1
