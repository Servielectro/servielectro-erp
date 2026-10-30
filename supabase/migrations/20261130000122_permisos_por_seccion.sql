-- Permisos sección por sección dentro de cada módulo (2026-10-29).
-- Escrita y aplicada por el orquestador. Idempotente.
--
-- Jhojan: "que aparezca sección por sección de cada módulo para seleccionar lo que queremos que
-- cada usuario tenga en vista cuando ingrese... si selecciono el módulo completo se selecciona
-- todo por dentro y si quito cada submódulo, puedo ir quitando o poniendo permisos."
--
-- ------------------------------------------------------------------ por qué por EXCLUSIÓN
-- El modelo guarda solo lo que se QUITA, no lo que se da. Un rol con el módulo habilitado ve todas
-- sus secciones; cada fila en `permisos_rol_seccion` es una sección que se le recortó.
--
-- Tres razones:
--   1. Hoy todos ven todo lo de su módulo. Con este modelo, el día que se aplique **nada cambia**
--      para nadie: cero filas = comportamiento actual. Una migración que empieza concediendo
--      sección por sección dejaría a todo el mundo sin nada hasta que alguien marque 60 casillas.
--   2. Es exactamente el gesto que pidió: el módulo prende todo y uno va quitando.
--   3. Cuando agreguemos una sección nueva, aparece sola para quien ya tiene el módulo. Lo
--      contrario —que una sección nueva quede invisible hasta que alguien se acuerde de darla—
--      es la clase de olvido que nadie detecta.
--
-- Además de ocultar, una sección puede REBAJAR el nivel: el módulo en "trabajar" pero esta sección
-- solo "consultar". Eso cubre el "qué vea cada uno y qué manipule cada uno".
--
-- ------------------------------------------------------------------ HASTA DÓNDE PROTEGE, DE FRENTE
-- `fn_tiene_permiso` NO se toca. Las 379 políticas de la base siguen exactamente igual, y eso es a
-- propósito: tocarlas sería arriesgar todo el ERP por una pantalla de configuración.
--
-- Consecuencia que hay que decir clara: esto decide **qué ve y qué puede abrir** cada quien —el
-- menú, el buscador y la entrada a cada página—, no blinda la tabla por debajo. Si a alguien se le
-- quita "Catálogo de ítems" pero conserva "Cotizaciones", los precios del catálogo le siguen
-- llegando por el armador de cotizaciones, porque es la misma tabla y la misma política.
--
-- Sirve para organizar a quién le aparece qué y para evitar que alguien entre donde no le toca.
-- NO sirve para esconderle un dato a alguien que tiene el módulo. Para eso está el nivel del
-- módulo y `ve_datos_sensibles`.

-- ============================================================ 1) las secciones que existen
create table if not exists public.modulo_secciones (
  modulo_id  text not null references public.modulos (id) on delete cascade,
  seccion_id text not null,
  nombre     text not null,
  href       text not null,
  orden      int  not null default 0,
  primary key (modulo_id, seccion_id)
);

comment on table public.modulo_secciones is
  'Las secciones de cada modulo, las mismas de src/lib/menu.ts. Si se agrega una alla, se agrega aqui.';

insert into public.modulo_secciones (modulo_id, seccion_id, nombre, href, orden) values
  ('comercial','cotizaciones','Cotizaciones','/comercial/cotizaciones',1),
  ('comercial','catalogo','Catálogo de ítems','/comercial/catalogo',2),
  ('comercial','crm','CRM','/comercial/crm',3),
  ('comercial','crm_clientes','Clientes del CRM','/comercial/crm/clientes',4),

  ('administrativo','clientes','Clientes','/administrativo/clientes',1),
  ('administrativo','importar_siigo','Importar clientes de SIIGO','/administrativo/clientes/importar',2),

  ('rrhh','personal','Personal','/rrhh/personal',1),
  ('rrhh','contratos','Contratos laborales','/rrhh/contratos',2),
  ('rrhh','contratos_plantillas','Plantillas y cláusulas de contrato','/rrhh/contratos/plantillas',3),
  ('rrhh','parametros','Parámetros de liquidación','/rrhh/parametros',4),
  ('rrhh','caja_menor','Caja menor (viáticos)','/rrhh/caja-menor',5),
  ('rrhh','gastos','Gastos del personal','/rrhh/gastos',6),
  ('rrhh','permisos','Permisos','/rrhh/permisos',7),
  ('rrhh','abonos','Abonos de nómina','/rrhh/abonos',8),
  ('rrhh','documentos','Documentos del personal','/rrhh/documentos',9),
  ('rrhh','plantillas_word','Plantillas Word (contrato)','/rrhh/plantillas',10),

  ('planificacion','agenda','Agenda','/planificacion/agenda',1),

  ('operativo','tareas','Tablero de tareas','/operativo/tareas',1),
  ('operativo','sugerencias','Sugerencias de los técnicos','/operativo/sugerencias',2),
  ('operativo','agenda','Agenda del equipo','/operativo/agenda',3),

  ('tecnico','gastos','Mis gastos y transportes','/tecnico/gastos',1),
  ('tecnico','permisos','Mis permisos','/tecnico/permisos',2),
  ('tecnico','abonos','Mis abonos de nómina','/tecnico/abonos',3),
  ('tecnico','documentos','Mis documentos y certificados','/tecnico/documentos',4),

  ('sgsst','campo','Llenar formato en sitio','/sgsst/campo',1),
  ('sgsst','formatos','Formatos llenados','/sgsst/formatos',2),
  ('sgsst','plantillas','Plantillas de formatos','/sgsst/plantillas',3),
  ('sgsst','reportes','Actos y condiciones inseguras','/sgsst/reportes',4),
  ('sgsst','eventos','Accidentes e incidentes','/sgsst/eventos',5),
  ('sgsst','plan','Plan de trabajo','/sgsst/plan',6),
  ('sgsst','plazos','Plazos de reporte','/sgsst/plazos',7),
  ('sgsst','personal','Personal','/sgsst/personal',8),
  ('sgsst','equipos','Equipos contra caídas','/sgsst/equipos',9),
  ('sgsst','actas_obra','Actas de obra','/sgsst/actas-obra',10),
  ('sgsst','sugerencias','Sugerencias para la aplicación','/sgsst/sugerencias',11),

  ('configuracion','usuarios','Usuarios y permisos','/configuracion/usuarios',1),
  ('configuracion','grupos','Grupos','/configuracion/grupos',2),
  ('configuracion','transferir','Transferir tareas','/configuracion/transferir',3),
  ('configuracion','problemas','Reportes de problema','/configuracion/problemas',4)
on conflict (modulo_id, seccion_id) do update
  set nombre = excluded.nombre, href = excluded.href, orden = excluded.orden;

-- ============================================================ 2) lo que se le quita a un rol
create table if not exists public.permisos_rol_seccion (
  rol_id     uuid not null references public.roles (id) on delete cascade,
  modulo_id  text not null,
  seccion_id text not null,
  -- false = no le aparece ni la puede abrir.
  visible    boolean not null default true,
  -- null = hereda el nivel del módulo. Solo sirve para REBAJAR, nunca para subir (lo fuerza
  -- fn_permiso_seccion: toma el menor entre el del módulo y este).
  nivel      nivel_permiso,
  primary key (rol_id, modulo_id, seccion_id),
  foreign key (modulo_id, seccion_id) references public.modulo_secciones (modulo_id, seccion_id) on delete cascade,
  -- Una fila que no quita nada no tiene razón de existir.
  constraint permisos_rol_seccion_util check (not visible or nivel is not null)
);

comment on table public.permisos_rol_seccion is
  'Solo lo que se RECORTA. Sin fila = la seccion se ve completa, con el nivel del modulo.';

alter table public.permisos_rol_seccion enable row level security;
revoke all on table public.permisos_rol_seccion from public, anon;
grant select, insert, update, delete on table public.permisos_rol_seccion to authenticated;

drop policy if exists permisos_rol_seccion_select on public.permisos_rol_seccion;
create policy permisos_rol_seccion_select on public.permisos_rol_seccion for select to authenticated
  using (fn_tiene_permiso('configuracion', 'consultar') or rol_id = (select rol_id from perfiles where id = auth.uid()));
drop policy if exists permisos_rol_seccion_todo on public.permisos_rol_seccion;
create policy permisos_rol_seccion_todo on public.permisos_rol_seccion for all to authenticated
  using (fn_tiene_permiso('configuracion', 'responsable'))
  with check (fn_tiene_permiso('configuracion', 'responsable'));

-- ============================================================ 3) el nivel efectivo de una sección
-- Devuelve null si no la puede ver. El nivel nunca sube por encima del módulo.
create or replace function public.fn_permiso_seccion(p_modulo text, p_seccion text)
returns nivel_permiso language sql stable security definer set search_path = public as $$
  select case
    when pr.nivel is null then null
    when not coalesce(s.visible, true) then null
    when s.nivel is null then pr.nivel
    -- el menor de los dos: la sección recorta, nunca amplía
    when s.nivel = 'consultar' or pr.nivel = 'consultar' then 'consultar'::nivel_permiso
    when s.nivel = 'trabajar' or pr.nivel = 'trabajar' then 'trabajar'::nivel_permiso
    else 'responsable'::nivel_permiso
  end
  from perfiles p
  left join permisos_rol pr on pr.rol_id = p.rol_id and pr.modulo_id = p_modulo
  left join permisos_rol_seccion s on s.rol_id = p.rol_id and s.modulo_id = p_modulo and s.seccion_id = p_seccion
  where p.id = auth.uid();
$$;

create or replace function public.fn_tiene_permiso_seccion(p_modulo text, p_seccion text, p_nivel nivel_permiso)
returns boolean language sql stable security definer set search_path = public as $$
  select case fn_permiso_seccion(p_modulo, p_seccion)
    when 'responsable' then true
    when 'trabajar' then p_nivel in ('consultar', 'trabajar')
    when 'consultar' then p_nivel = 'consultar'
    else false
  end;
$$;

-- Lo que el menú necesita: las secciones que esta persona tiene, con su nivel.
create or replace function public.fn_mis_secciones()
returns table (modulo_id text, seccion_id text, nombre text, href text, orden int, nivel nivel_permiso)
language sql stable security definer set search_path = public as $$
  select m.modulo_id, m.seccion_id, m.nombre, m.href, m.orden, fn_permiso_seccion(m.modulo_id, m.seccion_id)
  from modulo_secciones m
  where fn_permiso_seccion(m.modulo_id, m.seccion_id) is not null
  order by m.modulo_id, m.orden;
$$;

-- Para la pantalla de Usuarios y permisos: todas las secciones de un rol, con lo que tenga recortado.
create or replace function public.fn_secciones_de_rol(p_rol uuid)
returns table (modulo_id text, seccion_id text, nombre text, href text, orden int,
               nivel_modulo nivel_permiso, visible boolean, nivel_seccion nivel_permiso)
language sql stable security definer set search_path = public as $$
  select m.modulo_id, m.seccion_id, m.nombre, m.href, m.orden,
         pr.nivel, coalesce(s.visible, true), s.nivel
  from modulo_secciones m
  left join permisos_rol pr on pr.rol_id = p_rol and pr.modulo_id = m.modulo_id
  left join permisos_rol_seccion s on s.rol_id = p_rol and s.modulo_id = m.modulo_id and s.seccion_id = m.seccion_id
  where fn_tiene_permiso('configuracion', 'consultar')
  order by m.modulo_id, m.orden;
$$;

revoke all on function public.fn_permiso_seccion(text, text) from public, anon;
revoke all on function public.fn_tiene_permiso_seccion(text, text, nivel_permiso) from public, anon;
revoke all on function public.fn_mis_secciones() from public, anon;
revoke all on function public.fn_secciones_de_rol(uuid) from public, anon;
grant execute on function public.fn_permiso_seccion(text, text) to authenticated, service_role;
grant execute on function public.fn_tiene_permiso_seccion(text, text, nivel_permiso) to authenticated, service_role;
grant execute on function public.fn_mis_secciones() to authenticated, service_role;
grant execute on function public.fn_secciones_de_rol(uuid) to authenticated, service_role;
