-- Actas de obra para SG-SST (2026-10-29). Jhojan: "que esos formatos le lleguen a ella en un
-- submódulo de actas de obra y que ella sepa cuáles actas se firmaron, quiénes están trabajando en
-- cada sitio". Victoria (rol SG-SST) no tiene Proyectos, y Jhojan descartó dárselo.
--
-- NO es una copia. Los formatos de ámbito 'proyectos' viven en sst_formatos (migración 85); lo
-- único que la separaba de ellos era fn_plantillas_permiso, que pide Proyectos. Aquí se SUMAN
-- políticas de lectura (en Postgres las permisivas se combinan con OR): SG-SST "consultar" lee los
-- formatos de Proyectos que ya se firmaron (firmado, aprobado, y también anulado, que ella debe
-- saber que existió), con sus firmas, sus archivos y la plantilla con que se llenaron. Nada más:
-- ni borradores, ni el resto de Proyectos, ni escribir. Mismo patrón que fn_contratista_ve_planillas
-- (87): la función de acceso nombra a SG-SST y el dato se lee donde vive.
--
-- fn_plantillas_permiso NO se toca: abrirle el ámbito le mostraría los borradores, y esa función
-- también decide escrituras.
--
-- Tres funciones que ya existían se reemplazan con UNA condición más (OR fn_sgsst_ve_acta):
--   fn_sst_archivo_visible (85), fn_sst_formato_integro (85), fn_sst_hash_formato (88). Sin eso
--   ella vería el acta pero no sus fotos ni firmas, y el sello saldría "no íntegro" por no poder
--   calcular el hash. Solo amplían la lectura: ninguna escritura depende de ellas para ella.
--
-- El nombre de la obra: no lee la tabla proyectos; fn_sgsst_obras_de_actas devuelve código y nombre
-- solo de las obras que tienen actas que ella puede ver.
--
-- Va después de la 88. Idempotente.
-- Verificación: supabase/verificaciones/20261129000105_verificar.sql
-- Rollback:     supabase/rollbacks/20261129000105_actas_de_obra_para_sgsst_down.sql

-- ============================================================ 1) quién y qué
-- Un formato de Proyectos ya firmado, para quien tiene SG-SST.
create or replace function public.fn_sgsst_ve_acta(p_ambito text, p_estado text)
returns boolean
language sql
stable
set search_path = public
as $$
  select p_ambito = 'proyectos' and p_estado in ('firmado', 'aprobado', 'anulado') and fn_tiene_permiso('sgsst', 'consultar');
$$;

-- Lo mismo por id (para firmas y archivos: la fila hija no trae ámbito ni estado).
create or replace function public.fn_sgsst_ve_acta_id(p_formato_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select fn_sgsst_ve_acta(f.ambito, f.estado) from sst_formatos f where f.id = p_formato_id), false);
$$;

-- La plantilla con la que se llenó un acta que puede ver (para pintar el formato).
create or replace function public.fn_sgsst_ve_plantilla_de_acta(p_plantilla_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select fn_tiene_permiso('sgsst', 'consultar')
     and exists (select 1 from sst_formatos f where f.plantilla_id = p_plantilla_id and fn_sgsst_ve_acta(f.ambito, f.estado));
$$;

-- Código y nombre de las obras con actas que puede ver. Nada más de proyectos.
create or replace function public.fn_sgsst_obras_de_actas()
returns table (id uuid, codigo text, nombre text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.codigo, p.nombre
  from proyectos p
  where fn_tiene_permiso('sgsst', 'consultar')
    and exists (select 1 from sst_formatos f where f.proyecto_id = p.id and fn_sgsst_ve_acta(f.ambito, f.estado))
  order by p.codigo;
$$;

revoke all on function public.fn_sgsst_ve_acta(text, text) from public, anon;
revoke all on function public.fn_sgsst_ve_acta_id(uuid) from public, anon;
revoke all on function public.fn_sgsst_ve_plantilla_de_acta(uuid) from public, anon;
revoke all on function public.fn_sgsst_obras_de_actas() from public, anon;
grant execute on function public.fn_sgsst_ve_acta(text, text) to authenticated, service_role;
grant execute on function public.fn_sgsst_ve_acta_id(uuid) to authenticated, service_role;
grant execute on function public.fn_sgsst_ve_plantilla_de_acta(uuid) to authenticated, service_role;
grant execute on function public.fn_sgsst_obras_de_actas() to authenticated, service_role;

-- ============================================================ 2) políticas de lectura (se suman)
drop policy if exists sst_formatos_select_sgsst_actas on public.sst_formatos;
create policy sst_formatos_select_sgsst_actas on public.sst_formatos for select to authenticated
  using (fn_sgsst_ve_acta(ambito, estado));
drop policy if exists sst_formato_firmas_select_sgsst_actas on public.sst_formato_firmas;
create policy sst_formato_firmas_select_sgsst_actas on public.sst_formato_firmas for select to authenticated
  using (fn_sgsst_ve_acta_id(formato_id));
drop policy if exists sst_formato_archivos_select_sgsst_actas on public.sst_formato_archivos;
create policy sst_formato_archivos_select_sgsst_actas on public.sst_formato_archivos for select to authenticated
  using (fn_sgsst_ve_acta_id(formato_id));
drop policy if exists sst_plantillas_select_sgsst_actas on public.sst_plantillas;
create policy sst_plantillas_select_sgsst_actas on public.sst_plantillas for select to authenticated
  using (ambito = 'proyectos' and fn_sgsst_ve_plantilla_de_acta(id));

-- ============================================================ 3) las tres funciones de lectura, con la condición nueva
-- Igual que en la 85, con OR fn_sgsst_ve_acta en la rama de formatos.
create or replace function public.fn_sst_archivo_visible(p_nombre text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case (storage.foldername(p_nombre))[1]
    when 'formatos' then exists (select 1 from sst_formatos f where f.id::text = (storage.foldername(p_nombre))[2]
                                 and (fn_plantillas_permiso(f.ambito, 'consultar') or fn_sgsst_ve_acta(f.ambito, f.estado)))
    when 'reportes' then fn_tiene_permiso('sgsst', 'consultar')
      or exists (select 1 from sst_reportes_inseguros r where r.id::text = (storage.foldername(p_nombre))[2] and r.reportado_por = auth.uid())
    else fn_tiene_permiso('sgsst', 'consultar')
  end;
$$;

-- Igual que en la 85, con OR fn_sgsst_ve_acta.
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
  where f.id = p_formato_id and (fn_plantillas_permiso(f.ambito, 'consultar') or fn_sgsst_ve_acta(f.ambito, f.estado));
$$;

-- Igual que en la 88, con OR fn_sgsst_ve_acta (sin el hash, el sello saldría "no íntegro" para ella).
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
    and (pg_trigger_depth() > 0 or fn_plantillas_permiso(f.ambito, 'consultar') or fn_sgsst_ve_acta(f.ambito, f.estado));
$$;
