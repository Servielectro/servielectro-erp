-- Rollback de la migración 83: vuelve la regla de la 75 (para cerrar basta una firma de técnico).
-- La columna tecnicos_en_obra se queda (no se pierden las listas anotadas) pero deja de exigirse.
-- OJO: el hash vuelve al de la 75, así que un formato que ya se selló CON lista dejaría de verse
-- íntegro. Correr solo si todavía no se firmó ningún formato con lista:
--   select count(*) from sst_formatos where tecnicos_en_obra is not null and sellado_en is not null;  -- debe dar 0
drop trigger if exists trg_sst_tecnicos_firma on public.sst_formato_firmas;
drop trigger if exists trg_sst_tecnicos_formato on public.sst_formatos;
drop function if exists public.fn_sst_tecnicos_firma();
drop function if exists public.fn_sst_tecnicos_formato();
drop function if exists public.fn_sst_tecnicos_problema(jsonb);
drop function if exists public.fn_sst_tecnicos_de(uuid);
drop function if exists public.fn_sst_pide_tecnicos(uuid);
create or replace function public.fn_sst_hash_formato(p_formato_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select encode(sha256(convert_to(jsonb_build_object(
    'plantilla', f.plantilla_id,
    'proyecto', f.proyecto_id,
    'cliente', f.cliente_id,
    'lugar', f.lugar,
    'fecha', f.fecha,
    'respuestas', f.respuestas,
    'archivos', coalesce((select jsonb_agg(jsonb_build_array(a.campo_id, a.sha256) order by a.path)
                          from sst_formato_archivos a where a.formato_id = f.id), '[]'::jsonb)
  )::text, 'UTF8')), 'hex')
  from sst_formatos f
  where f.id = p_formato_id
    and (fn_tiene_permiso('sgsst', 'consultar'));
$$;
drop function if exists public.fn_sst_doc(text);
