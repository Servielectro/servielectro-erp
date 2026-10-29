-- Quién creó un cliente, una cotización y un ítem del catálogo (2026-10-29).
-- Escrita y aplicada por el orquestador. Idempotente.
--
-- Salió armando el usuario de demostración (116), pero NO es un detalle del demo: hoy el ERP
-- **no registra quién crea una cotización ni un cliente**. Nadie sabe quién armó la CSE-26-157.
-- Eso ya era un hueco de auditoría en el módulo que maneja la plata; el demo solo lo destapó.
--
-- Sin esta columna el borrado de la 116 es ciego justo donde más importa: el invitado armaría
-- cotizaciones y clientes en las tablas reales y **no habría forma de distinguirlos de los tuyos**.
--
-- Las filas que ya existen quedan con creado_por NULL, a propósito y sin rellenar:
--   * El borrado busca `creado_por = any(ids demo)`. NULL nunca coincide → lo viejo es intocable.
--   * El guardián exige que el autor sea el propio demo. NULL → no es suyo → no lo puede cambiar.
-- O sea: NULL significa "de la empresa" y queda protegido por construcción, sin inventar un autor
-- que no sabemos quién fue. Poner ahí al administrador sería escribir un dato falso en una tabla
-- de auditoría.
--
-- Los hijos de una cotización (items, pólizas, valores agregados, hitos) ya borran en cascada, así
-- que no necesitan columna propia.

alter table public.clientes       add column if not exists creado_por uuid default auth.uid() references public.perfiles (id);
alter table public.cotizaciones   add column if not exists creado_por uuid default auth.uid() references public.perfiles (id);
alter table public.items_catalogo add column if not exists creado_por uuid default auth.uid() references public.perfiles (id);

comment on column public.clientes.creado_por is
  'Quien creo el registro. NULL = anterior a esta migracion, se trata como dato de la empresa.';
comment on column public.cotizaciones.creado_por is
  'Quien creo la cotizacion. NULL = anterior a esta migracion, se trata como dato de la empresa.';
comment on column public.items_catalogo.creado_por is
  'Quien creo el item. NULL = anterior a esta migracion, se trata como dato de la empresa.';

-- El guardián de la 116, ahora sí, sobre las tablas que antes no tenían dónde agarrarse.
do $$
declare t text;
begin
  foreach t in array array['clientes', 'cotizaciones', 'items_catalogo'] loop
    execute format('drop trigger if exists trg_demo_guardian on public.%I', t);
    execute format(
      'create trigger trg_demo_guardian before update or delete on public.%I
       for each row execute function public.fn_demo_no_toca_lo_ajeno(%L)', t, 'creado_por');
  end loop;
end $$;
