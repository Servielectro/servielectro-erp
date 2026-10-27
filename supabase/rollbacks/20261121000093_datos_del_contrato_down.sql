-- Deshace 20261121000093 (datos del contrato). BORRA los contratos registrados (propuestas y
-- confirmados): correrlo solo si todavía no hay datos reales. Los documentos no se tocan.
drop view if exists public.v_proyecto_contrato_vigente;
drop table if exists public.proyecto_contratos;
drop function if exists public.fn_proyecto_contratos_reglas();
drop function if exists public.fn_contrato_documento_tipo(uuid);
drop function if exists public.fn_contrato_confirma();
