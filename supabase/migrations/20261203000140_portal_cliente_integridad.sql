-- Portal del cliente: verificación de integridad del acta para el contratante.
-- (Escrita como 0137; renumerada a 0138 y luego a 0140: la 0137, 0138 y 0139 aplicadas son del acta de inicio.)
--
-- fn_sst_formato_integro y fn_sst_hash_formato exigen permiso sobre el módulo (o fn_sgsst_ve_acta):
-- al cliente le devuelven null, y en el portal no se le podía decir si el acta que lee es
-- exactamente la que se firmó. Esta función le da SOLO ese booleano, y SOLO para un formato que
-- fn_cliente_ve_formato ya le deja ver (publicado, o acta suya por firmar). No devuelve el
-- contenido ni la huella: eso ya lo lee por la RLS de la 135.
--
-- OJO, mantenimiento: la huella se recalcula aquí con la MISMA expresión que fn_sst_hash_formato
-- (versión de 20261129000105_actas_de_obra_para_sgsst.sql). No se puede llamar a esa función porque
-- su filtro de permiso usa auth.uid() también dentro de un SECURITY DEFINER. Si algún día cambia la
-- expresión de fn_sst_hash_formato, hay que cambiarla aquí igual; si no, el portal diría
-- "NO coincide" en actas sanas.
--
-- null = no sellado todavía, o no lo puede ver. true/false = lo mismo que fn_sst_formato_integro.

create or replace function public.fn_cliente_formato_integro(p_formato_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with f as (
    select f.*
    from sst_formatos f
    where f.id = p_formato_id
      and f.hash_contenido is not null
      and public.fn_cliente_ve_formato(f.id)
  ),
  h as (
    select f.id, f.hash_contenido,
      encode(sha256(convert_to((jsonb_build_object(
        'plantilla', f.plantilla_id,
        'proyecto', f.proyecto_id,
        'cliente', f.cliente_id,
        'lugar', f.lugar,
        'fecha', f.fecha,
        'respuestas', f.respuestas,
        'archivos', coalesce((select jsonb_agg(jsonb_build_array(a.campo_id, a.sha256) order by a.path)
                              from sst_formato_archivos a where a.formato_id = f.id), '[]'::jsonb)
      ) || case when f.tecnicos_en_obra is null then '{}'::jsonb
                else jsonb_build_object('tecnicos_en_obra', f.tecnicos_en_obra) end)::text, 'UTF8')), 'hex') as recalculado
    from f
  )
  select h.hash_contenido = h.recalculado
     and not exists (select 1 from sst_formato_firmas x where x.formato_id = h.id and x.hash_contenido <> h.hash_contenido)
  from h;
$$;

revoke all on function public.fn_cliente_formato_integro(uuid) from public, anon;
grant execute on function public.fn_cliente_formato_integro(uuid) to authenticated;

-- Para probar después de aplicar:
--   1) Con un usuario interno: para un acta sellada, comparar
--        select fn_sst_formato_integro(id), fn_cliente_formato_integro(id)
--      La segunda da null (no es cliente). Para comparar las expresiones, como postgres:
--        select fn_sst_hash_formato(id) = (encode(...misma expresión...)) — o, más simple, con el
--      perfil de solo rol Cliente: fn_cliente_formato_integro(acta_publicada) debe dar true.
--   2) Con el perfil Cliente, sobre un ATS no publicado: debe dar null (no false: no lo ve).
