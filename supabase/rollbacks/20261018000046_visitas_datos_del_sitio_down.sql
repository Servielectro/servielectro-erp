-- Deshace 20261018000046. Si ya hay visitas reales, se pierde el nombre del cliente y el
-- contacto copiados en ellas.
alter table public.visitas drop column if exists telefono_sitio;
alter table public.visitas drop column if exists contacto_sitio;
alter table public.visitas drop column if exists cliente_nombre;
drop function if exists public.fn_tecnicos_asignables();
