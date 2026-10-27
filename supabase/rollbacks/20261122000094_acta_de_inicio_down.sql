-- Deshace 20261122000094 (acta de inicio). La plantilla NO se borra si ya hay actas hechas con ella
-- (se archivaría desde la pantalla de plantillas). Las columnas del representante legal se
-- quedan (no estorban). El calendario de festivos se borra.
drop trigger if exists trg_sst_formato_calculos on public.sst_formatos;
drop function if exists public.fn_sst_formato_calculos();
drop function if exists public.fn_formato_se_aparta(uuid);
drop function if exists public.fn_actas_prellenado();
delete from public.sst_plantillas p
where p.id = '00000000-0000-4000-8000-0000000094a1'
  and not exists (select 1 from public.sst_formatos f where f.plantilla_id = p.id);
drop function if exists public.fn_sumar_dias_habiles(date, int);
drop function if exists public.fn_festivos_de(int);
drop table if exists public.festivos_colombia;
