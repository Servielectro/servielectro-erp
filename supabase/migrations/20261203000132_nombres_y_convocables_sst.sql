-- 20261203000132 — SG-SST: nombres en los formatos y lista de usuarios para convocar a firmar.
--
-- Problema (reporte 2026-11-04, ATS FOR-14 en celular): "Llenado por —" y "Registrado por —".
-- leerFormato resolvía los uuid (creado_por, aprobado_por, sst_formato_firmas.registrada_por) solo
-- con fn_sst_personal: quien no tiene ficha de empleado con perfil_id (p. ej. un usuario de oficina)
-- quedaba en guion, y perfiles solo se lee a uno mismo o con Configuración "responsable".
--
-- Esta función entrega SOLO id y nombre de esas personas, y solo si quien pregunta ve el formato
-- con las mismas reglas de las políticas de sst_formatos (fn_plantillas_permiso por ámbito, o
-- fn_sgsst_ve_acta para las actas de obra, migración 105). Nada más de perfiles.
--
-- Idempotente. La app funciona sin ella (cae a fn_sst_personal); con ella, salen los nombres.

create or replace function public.fn_sst_nombres_formato(p_formato_id uuid)
returns table (id uuid, nombre text)
language sql
stable
security definer
set search_path = public
as $$
  with f as (
    select f.id, f.creado_por, f.aprobado_por
    from sst_formatos f
    where f.id = p_formato_id
      and (fn_plantillas_permiso(f.ambito, 'consultar') or fn_sgsst_ve_acta(f.ambito, f.estado))
  ),
  ids as (
    select creado_por as uid from f
    union select aprobado_por from f
    union select s.registrada_por from sst_formato_firmas s join f on f.id = s.formato_id
  )
  select p.id, p.nombre
  from perfiles p
  join ids on ids.uid = p.id
  where p.nombre is not null;
$$;

revoke all on function public.fn_sst_nombres_formato(uuid) from public, anon;
grant execute on function public.fn_sst_nombres_formato(uuid) to authenticated, service_role;

-- ------------------------------------------------------------------------------------------
-- Usuarios que se pueden convocar a firmar un formato (migración 131: sst_formato_convocados).
-- Quien convoca (SG-SST "trabajar", como la política de insert de la 131) no puede leer perfiles;
-- esta función le da SOLO id, nombre de la cuenta y nombre del rol de los usuarios con rol. Nada
-- de cédula, correo ni datos de empleados: la cédula real la escribe quien convoca.
create or replace function public.fn_sst_usuarios_convocables()
returns table (id uuid, nombre text, rol text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, coalesce(nullif(trim(p.nombre), ''), '(sin nombre)'), r.nombre
  from perfiles p
  join roles r on r.id = p.rol_id
  where fn_tiene_permiso('sgsst', 'trabajar')
  order by r.nombre, 2;
$$;

revoke all on function public.fn_sst_usuarios_convocables() from public, anon;
grant execute on function public.fn_sst_usuarios_convocables() to authenticated, service_role;
