-- Deshace 20261120000092: se quita el descarte (vuelve a ser solo anular con motivo). La huella
-- de lo ya descartado se pierde con la tabla; lo descartado no vuelve (se fue de verdad).
drop function if exists public.fn_descartar_reunion(uuid);
drop function if exists public.fn_reunion_por_que_no_descartar(uuid);
drop function if exists public.fn_descartar_formato(uuid);
drop function if exists public.fn_formato_por_que_no_descartar(uuid);
drop table if exists public.registros_descartados;
