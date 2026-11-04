-- Integridad del acta para el contratante, SIN duplicar la expresión del hash.
--
-- La primera versión de esta migración recalculaba la huella copiando la expresión de
-- fn_sst_hash_formato. Eso es frágil de la peor manera: si algún día cambia una de las dos,
-- el portal le diría a un cliente que su acta firmada "no coincide" siendo sana. Un falso
-- positivo de adulteración en un documento legal es peor que no mostrar nada.
--
-- En su lugar se extrae el cálculo a UNA función interna sin filtro de permiso, y tanto
-- fn_sst_hash_formato como la del portal la llaman. Una sola fuente de verdad.

create or replace function public.fn_sst_hash_formato_calc(p_formato_id uuid)
returns text language sql stable security definer set search_path = public as $$
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
  where f.id = p_formato_id;
$$;

-- Nadie la llama directo: es el motor de las dos de abajo.
revoke all on function public.fn_sst_hash_formato_calc(uuid) from public, anon, authenticated;

-- La de siempre conserva su filtro de permiso, pero ya no repite la expresión.
create or replace function public.fn_sst_hash_formato(p_formato_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select public.fn_sst_hash_formato_calc(f.id)
  from sst_formatos f
  where f.id = p_formato_id
    and (pg_trigger_depth() > 0 or fn_plantillas_permiso(f.ambito, 'consultar') or fn_sgsst_ve_acta(f.ambito, f.estado));
$$;

-- Lo que ve el contratante: solo el booleano, y solo de un acta que ya puede ver.
-- null = todavía sin sellar, o no la puede ver. true/false = igual que fn_sst_formato_integro.
create or replace function public.fn_cliente_formato_integro(p_formato_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select f.hash_contenido is not null
     and f.hash_contenido = public.fn_sst_hash_formato_calc(f.id)
     and not exists (select 1 from sst_formato_firmas x
                      where x.formato_id = f.id and x.hash_contenido <> f.hash_contenido)
  from sst_formatos f
  where f.id = p_formato_id
    and f.hash_contenido is not null
    and public.fn_cliente_ve_formato(f.id);
$$;

revoke all on function public.fn_cliente_formato_integro(uuid) from public, anon;
grant execute on function public.fn_cliente_formato_integro(uuid) to authenticated;

-- Verificado: fn_sst_hash_formato_calc de un acta sellada coincide con su hash_contenido guardado.
