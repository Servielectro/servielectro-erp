-- Deshace 20261018000045 (módulo Técnico, fase 1). BORRA las tablas del módulo con sus
-- datos: correrlo solo si todavía no hay visitas reales.
--
-- Lo que NO se deshace, a propósito:
--   - perfiles.cedula / perfiles.telefono (datos de personas; quitarlos a mano si hace falta);
--   - las filas de permisos del Administrador en tecnico y operativo (Jhojan no se queda
--     por fuera);
--   - el bucket visitas, si tiene archivos (Storage no deja borrar un bucket con archivos):
--     se borran sus políticas.

do $$
declare r record;
begin
  for r in
    select policyname from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and (coalesce(qual, '') || ' ' || coalesce(with_check, '')) ilike '%''visitas''%'
  loop
    execute format('drop policy %I on storage.objects', r.policyname);
  end loop;
end $$;

delete from storage.buckets
where id = 'visitas' and not exists (select 1 from storage.objects where bucket_id = 'visitas');

drop table if exists public.sugerencia_eventos;
drop table if exists public.visita_sugerencias;
drop table if exists public.visita_notas_posteriores;
drop table if exists public.visita_firmas;
drop table if exists public.visita_fotos;
drop table if exists public.visita_jornadas;
drop table if exists public.visitas;

drop function if exists public.fn_cambiar_estado_sugerencia(uuid, text, text, uuid);
drop function if exists public.fn_sugerencia_creada();
drop function if exists public.fn_sugerencias_estado_protegido();
drop function if exists public.fn_firma_despues();
drop function if exists public.fn_firma_antes();
drop function if exists public.fn_visitas_solo_estado_tecnico();
drop function if exists public.fn_candado_visita_insert();
drop function if exists public.fn_candado_visita();
drop function if exists public.fn_visita_de_ruta(text);
drop function if exists public.fn_visita_firmada(uuid);
drop function if exists public.fn_puede_escribir_visita(uuid);
drop function if exists public.fn_puede_ver_visita(uuid);
