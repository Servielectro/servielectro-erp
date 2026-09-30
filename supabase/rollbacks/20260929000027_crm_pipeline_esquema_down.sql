-- Deshace 20260929000027. OJO: borra todas las oportunidades, su historial y contactos.
drop table if exists oportunidad_contactos;
drop table if exists oportunidad_etapas_historial;
drop table if exists oportunidades;
drop table if exists etapas_config;
drop function if exists fn_oportunidad_historial();
drop function if exists fn_oportunidad_antes_guardar();
drop type if exists tipo_contacto;
drop type if exists motivo_perdida;
drop type if exists via_aprobacion;
drop type if exists estado_oportunidad;
drop type if exists tipo_pipeline;
