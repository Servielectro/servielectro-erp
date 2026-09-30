drop view if exists v_oportunidades_alertas;
drop function if exists fn_crear_renovaciones_pendientes();
drop index if exists idx_proyectos_vencimiento_contrato;
alter table proyectos drop column if exists fecha_vencimiento_contrato;
