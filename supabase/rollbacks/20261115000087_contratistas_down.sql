-- Deshace 20261115000087 (contratistas). BORRA contratistas, tarifas, planillas, cuentas de
-- cobro y su historial: correrlo solo si todavía no hay datos reales. Los archivos del bucket
-- "contratistas" NO se borran desde acá (Storage): vaciarlo a mano antes, si hace falta.

drop policy if exists contratistas_archivos_insert on storage.objects;
drop policy if exists contratistas_archivos_select on storage.objects;

drop table if exists public.contratista_eventos;
drop table if exists public.contratista_cuentas_cobro;
drop table if exists public.contratista_planilla_personas;
drop table if exists public.contratista_planillas;
drop table if exists public.contratista_tarifas;
drop table if exists public.contratistas;

drop function if exists public.fn_contratista_historial();
drop function if exists public.fn_contratista_cuentas_reglas();
drop function if exists public.fn_contratista_personas_reglas();
drop function if exists public.fn_contratista_planillas_reglas();
drop function if exists public.fn_contratista_tarifas_reglas();
drop function if exists public.fn_contratista_archivo(text, text);
drop function if exists public.fn_contratista_dias_sin_cobertura(uuid, date, date);
drop function if exists public.fn_contratista_cobertura(uuid, date);
drop function if exists public.fn_contratista_ve_planillas(uuid);
drop function if exists public.fn_contratista_ve_valores(uuid);
drop function if exists public.fn_contratista_de_planilla(uuid);
drop function if exists public.fn_es_contratista(uuid);
drop function if exists public.fn_contratistas_valores_admin();

-- El permiso del Administrador sobre el módulo se va siempre; el rol y el módulo, solo si nadie
-- quedó con el rol Contratistas.
delete from public.permisos_rol
where modulo_id = 'contratistas' and rol_id in (select id from public.roles where nombre = 'Administrador');
delete from public.permisos_rol
where modulo_id = 'contratistas'
  and not exists (select 1 from public.perfiles p join public.roles r on r.id = p.rol_id where r.nombre = 'Contratistas');
delete from public.roles r
where r.nombre = 'Contratistas' and not exists (select 1 from public.perfiles p where p.rol_id = r.id);
delete from public.modulos m
where m.id = 'contratistas' and not exists (select 1 from public.permisos_rol pr where pr.modulo_id = m.id);
-- El bucket (vacío) se borra desde el panel de Storage.
