-- Licitaciones: el radar y la estructura del motor de análisis (2026-11-07).
--
-- Pedido de Jhojan: «iniciemos por la estructura del ERP para licitaciones, para implementar el
-- radar y empezar a alimentar el ERP». Diseño tomado de docs/licitta-que-copiar.md: las reglas
-- importan más que el esquema.
--
-- ------------------------------------------------------------------ lo que ya había (drift)
-- licitaciones (41 columnas), licitacion_criterios (42 activos), licitacion_barridos (0 filas) y
-- v_licitaciones_nuevas existen en producción pero en NINGÚN archivo de este repo. Por eso esta
-- migración empieza con GUARDAS: verifica en information_schema cada columna y tipo de esas tablas
-- que usa, y si algo no coincide se detiene y dice qué. No se toca ni se renombra nada del
-- vocabulario de Jhojan (cumplimiento_probable, no_cumplimiento, informacion_pendiente, barreras,
-- proxima_accion, afinidad, semaforo, evaluada_por_ia). La fila PN-ESPOL-MIC-020-2026 (contrato
-- de la Policía ya ejecutado) es dato real y no se borra ni se reescribe.
--
-- ------------------------------------------------------------------ qué agrega
--  a) licitaciones.requiere_rup        true / false / null (null = no se pudo determinar la
--                                      modalidad; NUNCA false por silencio). Ley 1150/2007 art. 6.
--  b) licitaciones.dias_publicado_al_traer   cuán tarde nos enteramos (Datos Abiertos tarda 1-3 d).
--     licitaciones.secop               la fila tal como vino de Datos Abiertos: de dónde salió.
--     licitaciones.actividad_por       si la actividad calzó por UNSPSC o por palabra (ver c).
--  c) Los cinco criterios de relevancia de Licitta, como cálculo fijo, sin IA.
--  d) licitacion_documentos            pliego, estudios previos, anexo técnico, matriz, adendas.
--  e) licitacion_requisitos            una fila por requisito, once temas, cita de página.
--  f) v_licitacion_resultado           cumple / no cumple CALCULADO, nunca escrito a mano.
--  g) v_expediente_*                   el expediente como VISTAS sobre lo que ya existe.
--  +  aviso 'licitacion_sin_rup'       oportunidad relevante que no exige RUP.
--  +  funciones del barrido para la Edge Function barrer-secop (solo clave de servicio).
--
-- ------------------------------------------------------------------ UNSPSC: 6 dígitos, no 8
-- Los 42 criterios 'categoria' cargados son códigos de 8 dígitos (26111600, 43211700…). Licitta
-- hace el match por CLASE = primeros 6 dígitos (261116, 432117…). Con 8 dígitos se pierden
-- procesos que sí son nuestros (una entidad codifica 26111601 y nosotros cargamos 26111600). Los 8
-- dígitos se quedan cargados como están: el prefijo de 6 se saca al comparar.
--
-- La clase 801116 (personal temporal / prestación de servicios de persona natural) nunca cuenta
-- como actividad, igual que en Licitta. Es la 2.ª clase más frecuente de SECOP II.
--
-- ------------------------------------------------------------------ UNSPSC vacío (medido)
-- Consultado el 2026-11-07 en p6dx-8zbt: de los ~53.000 procesos publicados desde el 25/10,
-- 52.966 traen codigo_principal_de_categoria = 'UNSPECIFIED'. Con el UNSPSC como único camino a
-- la actividad, el radar daría CERO. Por eso: si el proceso NO trae ningún código, la actividad
-- se evalúa con los criterios 'palabra' sobre el nombre y la descripción del proceso, y queda
-- marcada actividad_por = 'palabra' (más débil que 'unspsc', y así se ve en la lista). Si el
-- proceso SÍ trae código, manda el código: una palabra no rescata un proceso de otra clase.
--
-- ------------------------------------------------------------------ relevante: actividad Y ubicación
-- Licitta: relevante = 4 o 5 de los cinco criterios, con la actividad siempre entre ellos; la
-- ubicación es uno más, blando. AQUÍ NOS APARTAMOS: la ubicación también es obligatoria.
-- Jhojan, 2026-11-07: «si sabe que es ruido, ¿para qué lo determina siquiera? Cuando le diga que
-- abramos esa ciudad, lo hace; del resto, no.» Licitta le vende a todo el país; Servielectro tiene
-- técnicos en ciudades concretas, y un proceso que no puede atender no es una oportunidad (con la
-- regla blanda, un CCTV de régimen especial en Pasto salía 4/5, relevante, y avisaba).
-- Relevante = actividad Y ubicación Y 4 o más (fn_licitacion_es_relevante). La modalidad sigue
-- blanda: lo que exige RUP puede salir relevante, pero no avisa (el aviso es solo sin RUP).
-- Abrir una ciudad = una fila 'ciudad' (o 'departamento') en licitacion_criterios. Nada más.
-- 'ciudad' compara contra ciudad_entidad de p6dx-8zbt (verificado en el dataset; Medellín no es
-- toda Antioquia). Si SECOP trae la ciudad «No Definido» (medido: ~1 de cada 4 procesos de
-- oct-2026; p. ej. el Hospital General de Medellín), se busca la ciudad como palabra en el nombre
-- de la entidad.
--
-- ------------------------------------------------------------------ líneas: sin eléctrico
-- Jhojan, 2026-11-07: «quita todo lo eléctrico y ups y todo eso. Solo seguridad electrónica.»
-- Los 9 códigos de la línea `electrico` (incluido 39121000, el de UPS/inversores/reguladores) se
-- DESACTIVAN con nota y fecha, no se borran. Sus palabras (MANTENIMIENTO ELECTRICO, SUBESTACION,
-- RETIE, PLANTA ELECTRICA, TABLERO ELECTRICO) no se cargan. Quedan seguridad_electronica, cercas,
-- monitoreo y redes. (redes queda activa mientras Jhojan decide si cuenta como seguridad
-- electrónica; si no, se apaga con un UPDATE.)
-- `linea` se queda en los criterios de actividad: dice por qué línea entró cada proceso
-- (licitaciones.lineas_que_calzaron).
--
-- HISTORIA (por si vuelve una línea con restricción propia): hubo, solo en el borrador de esta
-- migración y nunca aplicada, una «geografía por línea»: una ubicación con `linea` habilitaba solo
-- esa línea, y una línea con ubicaciones propias se buscaba SOLO ahí. Existía por eléctrico, que
-- solo se puede ejecutar en Bogotá/Cundinamarca/Tolima (técnico con certificado CONTE e ingeniero
-- electricista: capacidad legal, no preferencia). Al salir eléctrico, la ubicación quedó uniforme y
-- la regla se quitó: ubicaciones globales, sin `linea` (el CHECK lo impide). Si vuelve una línea
-- así, hay que reponer ese cruce en fn_licitacion_relevancia, no solo cargar filas con línea.

-- Requiere: pg (nada externo). El cron va aparte, en la 144, después de desplegar la función.
-- Verificación (BEGIN … ROLLBACK, contra producción): supabase/verificaciones/20261203000143_verificar.sql
-- Estado real previo (solo lectura): node scripts/licitaciones/estado-real.mjs

-- ============================================================ 0) guardas: lo que se asume del drift
do $$
declare
  v_falta text;
  v_tipo  text;
begin
  -- Columnas que esta migración lee o escribe en las tablas que no están en el repo.
  select string_agg(e.t || '.' || e.c, ', ') into v_falta
  from (values
    ('licitaciones', 'id'), ('licitaciones', 'id_del_proceso'), ('licitaciones', 'publicado_en'),
    ('licitaciones', 'traida_en'), ('licitaciones', 'afinidad'), ('licitaciones', 'criterios_que_coinciden'),
    -- las columnas de Jhojan que el barrido llena desde SECOP (las lee v_licitaciones_nuevas)
    ('licitaciones', 'referencia'), ('licitaciones', 'entidad'), ('licitaciones', 'nit_entidad'),
    ('licitaciones', 'departamento'), ('licitaciones', 'ciudad'), ('licitaciones', 'nombre'),
    ('licitaciones', 'descripcion'), ('licitaciones', 'modalidad'), ('licitaciones', 'tipo_contrato'),
    ('licitaciones', 'categoria_unspsc'), ('licitaciones', 'precio_base'), ('licitaciones', 'duracion'),
    ('licitaciones', 'fase'), ('licitaciones', 'estado_secop'), ('licitaciones', 'url'),
    ('licitaciones', 'actualizado_en_secop'), ('licitaciones', 'fecha_cierre_secop'),
    ('licitacion_criterios', 'id'), ('licitacion_criterios', 'tipo'), ('licitacion_criterios', 'valor'),
    ('licitacion_criterios', 'activo'), ('licitacion_criterios', 'linea'), ('licitacion_criterios', 'nombre'),
    ('licitacion_criterios', 'nota'), ('licitacion_criterios', 'creado_por'),
    ('licitacion_barridos', 'id'), ('licitacion_barridos', 'error')
  ) e(t, c)
  where not exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = e.t and column_name = e.c);
  if v_falta is not null then
    raise exception 'La base no tiene las columnas que esta migración asume: %. Corre scripts/licitaciones/estado-real.mjs y ajusta los nombres antes de aplicar.', v_falta;
  end if;

  -- Tipos.
  select string_agg(e.t || '.' || e.c || ' es ' || coalesce(c.udt_name, '?') || ' (se esperaba ' || e.esperado || ')', '; ')
    into v_falta
  from (values
    ('licitaciones', 'id', 'uuid'),
    ('licitaciones', 'id_del_proceso', 'text|varchar'),
    ('licitaciones', 'criterios_que_coinciden', '_text'),
    ('licitaciones', 'afinidad', 'int2|int4|int8|numeric'),
    ('licitaciones', 'publicado_en', 'timestamptz|timestamp|date'),
    ('licitaciones', 'traida_en', 'timestamptz|timestamp|date'),
    ('licitacion_criterios', 'tipo', 'text|varchar'),
    ('licitacion_criterios', 'valor', 'text|varchar'),
    ('licitacion_criterios', 'activo', 'bool'),
    ('licitacion_criterios', 'linea', 'text|varchar'),
    ('licitacion_criterios', 'nombre', 'text|varchar'),
    ('licitacion_criterios', 'nota', 'text|varchar'),
    ('licitacion_criterios', 'creado_por', 'uuid'),
    ('licitaciones', 'entidad', 'text|varchar'),
    ('licitaciones', 'nombre', 'text|varchar'),
    ('licitaciones', 'precio_base', 'numeric|int4|int8'),
    ('licitaciones', 'actualizado_en_secop', 'date|timestamp|timestamptz'),
    ('licitaciones', 'fecha_cierre_secop', 'date|timestamp|timestamptz'),
    ('licitacion_barridos', 'id', 'uuid'),
    ('licitacion_barridos', 'error', 'text|varchar')
  ) e(t, c, esperado)
  join information_schema.columns c on c.table_schema = 'public' and c.table_name = e.t and c.column_name = e.c
  where c.udt_name !~ ('^(' || e.esperado || ')$');
  if v_falta is not null then
    raise exception 'Tipos distintos a los asumidos: %.', v_falta;
  end if;

  -- Columnas NOT NULL sin default que el barrido no llenaría: el INSERT rebotaría en cada vuelta.
  select string_agg(table_name || '.' || column_name, ', ') into v_falta
  from information_schema.columns
  where table_schema = 'public'
    and ((table_name = 'licitaciones' and column_name not in
           ('id', 'id_del_proceso', 'publicado_en', 'traida_en', 'afinidad', 'criterios_que_coinciden', 'entidad', 'nombre'))
      or (table_name = 'licitacion_barridos' and column_name not in ('id', 'error'))
      -- esta migración carga criterios (ubicación, modalidad y palabras confirmadas por Jhojan)
      or (table_name = 'licitacion_criterios' and column_name not in ('id', 'tipo', 'valor', 'activo', 'linea', 'nombre')))
    and is_nullable = 'NO' and column_default is null and is_generated = 'NEVER';
  if v_falta is not null then
    raise exception 'Columnas obligatorias sin valor por defecto que el radar no sabe llenar: %. Hay que darles default o mapearlas en fn_licitaciones_ingerir.', v_falta;
  end if;

  -- Los ids necesitan default (el barrido no los inventa).
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'licitaciones' and column_name = 'id' and column_default is not null)
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'licitacion_barridos' and column_name = 'id' and column_default is not null)
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'licitacion_criterios' and column_name = 'id' and column_default is not null) then
    raise exception 'licitaciones.id, licitacion_barridos.id o licitacion_criterios.id no tienen default.';
  end if;

  -- Los tipos que hoy hay en licitacion_criterios: si hay alguno fuera de los conocidos, avisar.
  select string_agg(distinct tipo, ', ') into v_tipo
  from public.licitacion_criterios
  where tipo not in ('categoria', 'palabra', 'entidad', 'modalidad', 'tipo_contrato', 'presupuesto', 'departamento', 'ciudad');
  if v_tipo is not null then
    raise exception 'licitacion_criterios trae tipos que no se esperaban: %. Revisar antes de cambiar el CHECK.', v_tipo;
  end if;

  -- `linea` solo tiene sentido en la actividad (ver el CHECK de la sección 3).
  select string_agg(distinct tipo || '=' || linea, ', ') into v_tipo
  from public.licitacion_criterios
  where linea is not null and tipo not in ('categoria', 'palabra');
  if v_tipo is not null then
    raise exception 'Hay criterios con línea en tipos que no la admiten: %. Revisar antes de aplicar.', v_tipo;
  end if;

  if to_regprocedure('public.fn_tiene_permiso_seccion(text,text,nivel_permiso)') is null
     or to_regprocedure('public.fn_notif_con_permiso(text,nivel_permiso)') is null
     or to_regclass('public.v_cotizacion_totales_iva') is null then
    raise exception 'Faltan piezas de migraciones anteriores (fn_tiene_permiso_seccion, fn_notif_con_permiso o v_cotizacion_totales_iva).';
  end if;
end $$;

-- ============================================================ 1) utilidades
-- Texto comparable: minúsculas, sin tildes, sin signos. (unaccent no está garantizado en el proyecto.)
create or replace function public.fn_licitacion_norm(p text)
returns text language sql immutable parallel safe as $$
  select nullif(trim(regexp_replace(
           translate(lower(coalesce(p, '')), 'áéíóúàèìòùäëïöüâêîôûñç', 'aeiouaeiouaeiouaeiounc'),
           '[^a-z0-9]+', ' ', 'g')), '');
$$;

-- El día en Bogotá de una fecha u hora, sea cual sea el tipo de la columna (el drift no dice cuál).
create or replace function public.fn_dia_bogota(p timestamptz)
returns date language sql immutable parallel safe as $$ select (p at time zone 'America/Bogota')::date $$;
create or replace function public.fn_dia_bogota(p timestamp)
returns date language sql immutable parallel safe as $$ select p::date $$;
create or replace function public.fn_dia_bogota(p date)
returns date language sql immutable parallel safe as $$ select p $$;

-- ¿La modalidad exige RUP? Ley 1150 de 2007, art. 6: el RUP se exige en general, y NO en
-- contratación directa, mínima cuantía, enajenación de bienes ni en los regímenes especiales
-- (entidades no sometidas al Estatuto General). Licitación pública, selección abreviada y
-- concurso de méritos SÍ lo exigen.
-- Lo que no se reconoce devuelve NULL = «no se pudo determinar». Nunca false por silencio:
-- "Solicitud de información a los Proveedores", "Subasta de prueba" o una modalidad nueva
-- quedan en null y se ven como tales.
create or replace function public.fn_licitacion_requiere_rup(p_modalidad text)
returns boolean language sql immutable parallel safe as $$
  select case
    when m is null                         then null
    when m like '%minima cuantia%'         then false
    when m like '%regimen especial%'       then false
    when m like '%contratacion directa%'   then false
    when m like '%enajenacion%'            then false
    when m like '%licitacion publica%'     then true
    when m like '%seleccion abreviada%'    then true
    when m like '%concurso de meritos%'    then true
    else null
  end
  from (select public.fn_licitacion_norm(p_modalidad) as m) x;
$$;

-- ============================================================ 2) licitaciones: columnas nuevas
alter table public.licitaciones
  add column if not exists requiere_rup boolean,
  add column if not exists dias_publicado_al_traer smallint,
  add column if not exists secop jsonb,
  add column if not exists actividad_por text,
  add column if not exists lineas_que_calzaron text[];

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.licitaciones'::regclass and conname = 'licitaciones_actividad_por_check') then
    alter table public.licitaciones add constraint licitaciones_actividad_por_check
      check (actividad_por is null or actividad_por in ('unspsc', 'palabra', 'sin_criterio'));
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.licitaciones'::regclass and conname = 'licitaciones_secop_objeto') then
    alter table public.licitaciones add constraint licitaciones_secop_objeto
      check (secop is null or jsonb_typeof(secop) = 'object');
  end if;
end $$;

comment on column public.licitaciones.requiere_rup is
  'true = la modalidad exige RUP; false = no lo exige (mínima cuantía, régimen especial, directa, enajenación; Ley 1150/2007 art. 6); null = no se pudo determinar la modalidad. Nunca false por silencio. En filas del radar lo calcula la base desde secop.modalidad_de_contratacion.';
comment on column public.licitaciones.dias_publicado_al_traer is
  'Días (calendario Bogotá) entre publicado_en y traida_en. Datos Abiertos tarda 1 a 3 días: la lista nunca está completa al día.';
comment on column public.licitaciones.secop is
  'La fila de SECOP II (Datos Abiertos p6dx-8zbt) tal como llegó en el último barrido. null = no vino del radar (cargada a mano).';
comment on column public.licitaciones.actividad_por is
  'Cómo calzó el criterio de actividad: unspsc (clase de 6 dígitos), palabra (el proceso no traía código y calzó una palabra), sin_criterio (no hay criterios de actividad).';
comment on column public.licitaciones.lineas_que_calzaron is
  'Líneas de negocio (licitacion_criterios.linea) por las que calzó la actividad: el «por qué entró». sin_linea = criterio de actividad sin línea.';

-- La llave natural del radar. Solo se crea si no hay ya un índice único sobre esa columna sola.
do $$ begin
  if not exists (
    select 1 from pg_index i
    where i.indrelid = 'public.licitaciones'::regclass and i.indisunique and i.indpred is null
      and i.indnkeyatts = 1
      and i.indkey[0] = (select attnum from pg_attribute where attrelid = 'public.licitaciones'::regclass and attname = 'id_del_proceso')
  ) then
    create unique index uq_licitaciones_id_del_proceso on public.licitaciones (id_del_proceso);
  end if;
end $$;

-- Derivados: días y RUP. Los calcula la base, no la app.
create or replace function public.fn_licitaciones_derivados()
returns trigger language plpgsql set search_path = public as $$
begin
  new.dias_publicado_al_traer := case
    when new.publicado_en is null or new.traida_en is null then null
    else (public.fn_dia_bogota(new.traida_en) - public.fn_dia_bogota(new.publicado_en))::smallint
  end;
  -- Solo para lo que vino del radar: una fila manual conserva lo que diga quien la cargó.
  if new.secop is not null then
    new.requiere_rup := public.fn_licitacion_requiere_rup(new.secop ->> 'modalidad_de_contratacion');
  end if;
  return new;
end $$;

drop trigger if exists trg_licitaciones_derivados on public.licitaciones;
create trigger trg_licitaciones_derivados
  before insert or update of publicado_en, traida_en, secop on public.licitaciones
  for each row execute function public.fn_licitaciones_derivados();

-- La fila de la Policía no vino del radar: la base no sabe su modalidad. Jhojan la verificó contra la
-- factura electrónica del contrato ejecutado: mínima cuantía (el «MIC» del número). Se marca
-- requiere_rup = false y, si la tabla tiene columna `modalidad` (drift: no se sabe), se llena solo
-- si está vacía. Nada más de esa fila se toca.
update public.licitaciones set requiere_rup = false
 where id_del_proceso = 'PN-ESPOL-MIC-020-2026' and secop is null and requiere_rup is distinct from false;
do $$ begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'licitaciones'
             and column_name = 'modalidad' and udt_name in ('text', 'varchar')) then
    execute $u$update public.licitaciones set modalidad = 'Mínima cuantía'
               where id_del_proceso = 'PN-ESPOL-MIC-020-2026' and secop is null and coalesce(trim(modalidad), '') = ''$u$;
  end if;
end $$;

-- Relleno de los días de las filas que ya están (hoy: la de la Policía).
update public.licitaciones
   set dias_publicado_al_traer = (public.fn_dia_bogota(traida_en) - public.fn_dia_bogota(publicado_en))::smallint
 where publicado_en is not null and traida_en is not null
   and dias_publicado_al_traer is distinct from (public.fn_dia_bogota(traida_en) - public.fn_dia_bogota(publicado_en))::smallint;

-- ============================================================ 3) criterios: los cinco de Licitta
-- actividad      = 'categoria' (UNSPSC, se compara la clase de 6 dígitos) o 'palabra'
-- modalidad      = 'modalidad'       (texto contenido en la modalidad de SECOP: «mínima cuantía»)
-- tipo contrato  = 'tipo_contrato'   («obra», «prestación de servicios», «suministros»…)
-- presupuesto    = 'presupuesto'     (rango en valor_desde / valor_hasta; uno de los dos puede faltar)
-- ubicación      = 'departamento'    (texto contenido en el departamento de la entidad)
--                  'ciudad'          (igual a ciudad_entidad; si SECOP no la trae, palabra en el nombre de la entidad)
--                  Globales: sin `linea` (ver «HISTORIA» en el encabezado).
-- 'entidad' ya estaba en el CHECK de Jhojan (drift) y se conserva; el cálculo todavía no lo usa.
-- Columnas del drift que hay que llenar al cargar: nombre (NOT NULL) y creado_por (NOT NULL con
-- default auth.uid(), que aplicando por la API es null: se pone explícito).
alter table public.licitacion_criterios
  add column if not exists valor_desde numeric(18,2),
  add column if not exists valor_hasta numeric(18,2);

do $$
declare r record;
begin
  -- Se cambia el CHECK de tipo: se borra el que haya (por pg_constraint, no por nombre: drift).
  for r in select conname from pg_constraint
           where conrelid = 'public.licitacion_criterios'::regclass and contype = 'c'
             and pg_get_constraintdef(oid) ~ '\mtipo\M'
  loop
    execute format('alter table public.licitacion_criterios drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.licitacion_criterios
  add constraint licitacion_criterios_tipo_check
    check (tipo in ('categoria', 'palabra', 'entidad', 'modalidad', 'tipo_contrato', 'presupuesto', 'departamento', 'ciudad')),
  add constraint licitacion_criterios_linea_check
    check (linea is null or tipo in ('categoria', 'palabra')),
  add constraint licitacion_criterios_presupuesto_check
    check (case when tipo = 'presupuesto'
                then (valor_desde is not null or valor_hasta is not null)
                     and (valor_desde is null or valor_hasta is null or valor_desde <= valor_hasta)
                     and (valor_desde is null or valor_desde >= 0)
                else valor_desde is null and valor_hasta is null end);

comment on table public.licitacion_criterios is
  'Los cinco criterios de relevancia (Licitta): actividad (categoria UNSPSC por clase de 6 dígitos, o palabra), modalidad, tipo_contrato, presupuesto (rango), ubicación (departamento o ciudad). Lo que no se marca cuenta como cumplido: sin filas activas de un tipo, ese criterio se cumple para todos. Relevante = actividad Y ubicación Y 4 o más (nos apartamos de Licitta en la ubicación: ver la 143). Las ubicaciones son globales; linea solo va en la actividad y dice por qué entró el proceso.';

-- ¿Una palabra de actividad calza con un texto? Mismo cálculo para la base y para
-- scripts/licitaciones/palabras.mjs (que la imita en JS).
--   · minúsculas, sin tildes ni signos (fn_licitacion_norm): «SUBESTACION» calza «subestación»;
--   · la frase empieza una palabra del texto (no se busca en medio de una palabra);
--   · cada palabra de la frase salvo la última admite plural (s / es): «PLANTA ELECTRICA» calza
--     «plantas eléctricas», «RED DE DATOS» calza «redes de datos». Sin esto el plural solo se
--     pescaba en la última palabra (medido el 2026-11-07: 7 de las 26 palabras confirmadas no
--     habrían calzado su plural);
--   · la última palabra calza por PREFIJO: «CONCERTINA» → «concertinas», «ALARMA» → «alarmas».
--     Ojo: también «RETIE» → «retiene». Se aceptó: es raro en el objeto de un proceso.
-- fn_licitacion_norm deja solo [a-z0-9 ], así que el patrón no necesita escapar nada.
create or replace function public.fn_licitacion_palabra_calza(p_texto text, p_palabra text)
returns boolean language sql immutable parallel safe set search_path = public as $$
  select case when length(coalesce(fn_licitacion_norm(p_palabra), '')) < 3 then false
              else (' ' || coalesce(fn_licitacion_norm(p_texto), '') || ' ')
                   ~ (' ' || replace(fn_licitacion_norm(p_palabra), ' ', '(s|es)? ')) end;
$$;

-- Una palabra en DOS líneas rompe el «por qué línea entró» (y, si vuelve una línea con zona propia,
-- haría que el proceso valga o no en una ciudad según cuál gane). Por eso: una palabra, una línea. Lo garantiza un índice único; el trigger da el mensaje claro.
create or replace function public.fn_licitacion_criterios_palabra_unica()
returns trigger language plpgsql set search_path = public as $$
declare v_otra text;
begin
  if new.tipo = 'palabra' then
    select coalesce(linea, '(sin línea)') into v_otra from licitacion_criterios c
     where c.tipo = 'palabra' and c.id is distinct from new.id
       and fn_licitacion_norm(c.valor) = fn_licitacion_norm(new.valor)
       and c.linea is distinct from new.linea
     limit 1;
    if found then
      raise exception 'La palabra «%» ya está en la línea %. Una palabra va en una sola línea: es lo que dice por qué entró el proceso.',
        new.valor, v_otra using errcode = 'unique_violation';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_licitacion_criterios_palabra_unica on public.licitacion_criterios;
create trigger trg_licitacion_criterios_palabra_unica
  before insert or update of tipo, linea, valor on public.licitacion_criterios
  for each row execute function public.fn_licitacion_criterios_palabra_unica();

-- Los índices únicos (también dan el «on conflict do nothing» de abajo). Si lo que ya hay en la
-- base tiene repetidos, se detiene y los nombra en vez de fallar con un error genérico.
do $$
declare v text;
begin
  select string_agg(x, '; ') into v from (
    select 'palabra «' || min(valor) || '» en ' || string_agg(coalesce(linea, '(sin línea)'), ', ') x
    from public.licitacion_criterios where tipo = 'palabra'
    group by public.fn_licitacion_norm(valor) having count(*) > 1
    union all
    select tipo || ' «' || min(valor) || '» ' || coalesce(linea, '(sin línea)') || ' ×' || count(*)
    from public.licitacion_criterios where tipo in ('modalidad', 'tipo_contrato', 'departamento', 'ciudad')
    group by tipo, linea, public.fn_licitacion_norm(valor) having count(*) > 1) d;
  if v is not null then
    raise exception 'licitacion_criterios tiene repetidos que impiden el índice único: %. Decidir cuál queda antes de aplicar.', v;
  end if;
end $$;
create unique index if not exists uq_licitacion_criterios_palabra
  on public.licitacion_criterios (public.fn_licitacion_norm(valor)) where tipo = 'palabra';
create unique index if not exists uq_licitacion_criterios_filtro
  on public.licitacion_criterios (tipo, coalesce(linea, ''), public.fn_licitacion_norm(valor))
  where tipo in ('modalidad', 'tipo_contrato', 'departamento', 'ciudad');

-- Lo que Jhojan confirmó el 2026-11-07. Idempotente: «on conflict do nothing» sin columna, así cubre
-- también el índice único que ya tenía la base (licitacion_criterios_uk: tipo, upper(valor)). No
-- duplica si ya está, activo o no.
-- creado_por: quien creó los criterios que ya había (Jhojan cargó todo desde esa cuenta). Aplicando
-- por la API, auth.uid() es null y el default de la columna rebotaría.
--   Modalidad: mínima cuantía y régimen especial. Sin RUP no puede presentarse a licitación
--     pública, selección abreviada ni concurso de méritos: verlas sería ruido. Con el RUP
--     (≈ 2.º trimestre de 2027) se agregan esas filas.
--   Ubicación (global, para todas las líneas):
--     · departamentos completos: Bogotá, Cundinamarca y Tolima. Bogotá se escribe como lo trae
--       SECOP en departamento_entidad: «Distrito Capital de Bogotá» (verificado en p6dx-8zbt;
--       «Bogotá D.C.» no aparece);
--     · ciudades (como las escribe ciudad_entidad): Medellín, Cali, Barranquilla, Bucaramanga,
--       Cartagena, Santa Marta y Armenia.
insert into public.licitacion_criterios (tipo, nombre, valor, nota, creado_por, activo)
select n.tipo, n.valor, n.valor, 'Confirmado por Jhojan el 2026-11-07 (migración 143).',
       coalesce(auth.uid(), (select c.creado_por from public.licitacion_criterios c order by c.creado_en limit 1)), true
from (values
  ('modalidad', 'Mínima cuantía'), ('modalidad', 'Régimen especial'),
  ('departamento', 'Distrito Capital de Bogotá'), ('departamento', 'Cundinamarca'), ('departamento', 'Tolima'),
  ('ciudad', 'Medellín'), ('ciudad', 'Cali'), ('ciudad', 'Barranquilla'), ('ciudad', 'Bucaramanga'),
  ('ciudad', 'Cartagena'), ('ciudad', 'Santa Marta'), ('ciudad', 'Armenia')
) n(tipo, valor)
on conflict do nothing;

-- Eléctrico fuera (Jhojan, 2026-11-07: «quita todo lo eléctrico y ups y todo eso. Solo seguridad
-- electrónica.»). Se desactiva, no se borra: queda la fila, con la nota y la fecha. El UPS
-- (39121000, «UPS, inversores, reguladores, transformadores y PDU») es de esta línea; en las demás
-- no hay ningún criterio de UPS (revisado contra producción el 2026-11-07).
update public.licitacion_criterios
   set activo = false,
       nota = coalesce(nullif(trim(nota), '') || ' · ', '')
              || 'Desactivado el 2026-11-07 (migración 143): Jhojan, «quita todo lo eléctrico y ups y todo eso. Solo seguridad electrónica.»'
 where linea = 'electrico' and activo;

-- Las palabras por línea que confirmó Jhojan (2026-11-07). El mensaje decía 28; la lista traía 26,
-- y las 5 de eléctrico (MANTENIMIENTO ELECTRICO, SUBESTACION, RETIE, PLANTA ELECTRICA, TABLERO
-- ELECTRICO) ya no se cargan: quedan 21. Hasta hoy las 14 palabras cargadas eran todas de
-- seguridad_electronica y, como ~99,9 % de los procesos llega sin UNSPSC, cercas, monitoreo y
-- redes daban CERO para siempre.
-- Decisiones que NO son obvias (no «simplificar»):
--   · CERRAMIENTO a secas NO, solo CERRAMIENTO ELECTRICO: Servielectro no hace cerramiento físico
--     (rejas, mampostería). Lo dijo Jhojan.
--   · CAMARA sola NO: «Cámara de Comercio» está en el objeto de muchísimos procesos. De ahí las
--     cuatro formas específicas (CAMARA DE SEGURIDAD, CAMARA DE VIDEO, CAMARA IP, CAMARAS).
--   · TELEFONIA sola NO, solo PUNTOS DE TELEFONIA y CENTRAL TELEFONICA: telefonía de red de datos
--     para oficinas, no servicio de operador.
--   · Nada de ALARMA COMUNITARIA / INTERNA / INTRUSION: ALARMA ya está y calza por prefijo.
--   · CCTV, CIRCUITO CERRADO y CAMARAS DE SEGURIDAD quedan SOLO en seguridad_electronica, aunque
--     Jhojan las mencionó en monitoreo: una palabra en dos líneas rompe el «por qué entró» (ver el
--     índice único de arriba).
--   · ALUMBRADO fuera: se propuso y Jhojan lo descartó; no lo hacen.
-- Si una de estas ya existe en OTRA línea, el trigger lo rebota con nombre (no se salta en silencio).
insert into public.licitacion_criterios (tipo, nombre, valor, linea, nota, creado_por, activo)
select 'palabra', n.nombre, n.valor, n.linea, 'Confirmada por Jhojan el 2026-11-07 (migración 143).',
       coalesce(auth.uid(), (select c.creado_por from public.licitacion_criterios c order by c.creado_en limit 1)), true
from (values
  ('cercas', 'CERCA ELECTRICA', 'Cerca eléctrica'), ('cercas', 'CERCA SENSORIZADA', 'Cerca sensorizada'),
  ('cercas', 'CERCA PERIMETRAL', 'Cerca perimetral'), ('cercas', 'CERRAMIENTO ELECTRICO', 'Cerramiento eléctrico'),
  ('cercas', 'CONCERTINA', 'Concertina'), ('cercas', 'HAGROY', 'Hagroy'),
  ('monitoreo', 'MONITOREO DE ALARMAS', 'Monitoreo de alarmas'), ('monitoreo', 'VIGILANCIA ELECTRONICA', 'Vigilancia electrónica'),
  ('monitoreo', 'CENTRO DE MONITOREO', 'Centro de monitoreo'),
  ('redes', 'CABLEADO ESTRUCTURADO', 'Cableado estructurado'), ('redes', 'RED DE FIBRA', 'Red de fibra'),
  ('redes', 'FIBRA OPTICA', 'Fibra óptica'), ('redes', 'RED DE DATOS', 'Red de datos'),
  ('redes', 'PUNTOS DE DATOS', 'Puntos de datos'), ('redes', 'PUNTOS DE TELEFONIA', 'Puntos de telefonía'),
  ('redes', 'CENTRAL TELEFONICA', 'Central telefónica'),
  ('seguridad_electronica', 'CAMARA DE SEGURIDAD', 'Cámara de seguridad'), ('seguridad_electronica', 'CAMARA DE VIDEO', 'Cámara de video'),
  ('seguridad_electronica', 'CAMARA IP', 'Cámara IP'), ('seguridad_electronica', 'CAMARAS', 'Cámaras'),
  ('seguridad_electronica', 'SISTEMA CONTRA INCENDIO', 'Sistema contra incendio')
) n(linea, valor, nombre)
on conflict do nothing;

-- Comprobación: cada palabra confirmada quedó ACTIVA en SU línea, las ubicaciones y modalidades
-- quedaron activas, y no queda nada eléctrico activo. Un «on conflict do nothing» que no hizo nada
-- no cuenta como cargado.
do $$
declare v text;
begin
  select string_agg(n.valor || ' (' || n.linea || ')', ', ') into v
  from (values
    ('cercas', 'CERCA ELECTRICA'), ('cercas', 'CERCA SENSORIZADA'), ('cercas', 'CERCA PERIMETRAL'),
    ('cercas', 'CERRAMIENTO ELECTRICO'), ('cercas', 'CONCERTINA'), ('cercas', 'HAGROY'),
    ('monitoreo', 'MONITOREO DE ALARMAS'), ('monitoreo', 'VIGILANCIA ELECTRONICA'), ('monitoreo', 'CENTRO DE MONITOREO'),
    ('redes', 'CABLEADO ESTRUCTURADO'), ('redes', 'RED DE FIBRA'), ('redes', 'FIBRA OPTICA'), ('redes', 'RED DE DATOS'),
    ('redes', 'PUNTOS DE DATOS'), ('redes', 'PUNTOS DE TELEFONIA'), ('redes', 'CENTRAL TELEFONICA'),
    ('seguridad_electronica', 'CAMARA DE SEGURIDAD'), ('seguridad_electronica', 'CAMARA DE VIDEO'),
    ('seguridad_electronica', 'CAMARA IP'), ('seguridad_electronica', 'CAMARAS'), ('seguridad_electronica', 'SISTEMA CONTRA INCENDIO')
  ) n(linea, valor)
  where not exists (select 1 from public.licitacion_criterios c where c.tipo = 'palabra' and c.activo
                    and c.linea = n.linea and public.fn_licitacion_norm(c.valor) = public.fn_licitacion_norm(n.valor));
  if v is not null then
    raise exception 'Palabras confirmadas que no quedaron activas en su línea: %.', v;
  end if;

  select string_agg(n.tipo || ' ' || n.valor, ', ') into v
  from (values
    ('modalidad', 'Mínima cuantía'), ('modalidad', 'Régimen especial'),
    ('departamento', 'Distrito Capital de Bogotá'), ('departamento', 'Cundinamarca'), ('departamento', 'Tolima'),
    ('ciudad', 'Medellín'), ('ciudad', 'Cali'), ('ciudad', 'Barranquilla'), ('ciudad', 'Bucaramanga'),
    ('ciudad', 'Cartagena'), ('ciudad', 'Santa Marta'), ('ciudad', 'Armenia')
  ) n(tipo, valor)
  where not exists (select 1 from public.licitacion_criterios c where c.tipo = n.tipo and c.activo
                    and public.fn_licitacion_norm(c.valor) = public.fn_licitacion_norm(n.valor));
  if v is not null then
    raise exception 'Ubicaciones o modalidades confirmadas que no quedaron activas: %.', v;
  end if;

  select string_agg(tipo || ' ' || valor, ', ') into v
  from public.licitacion_criterios where activo and linea = 'electrico';
  if v is not null then
    raise exception 'Quedaron criterios eléctricos activos: %.', v;
  end if;
end $$;

-- ============================================================ 4) relevancia: cálculo fijo, sin IA
-- Devuelve los criterios cumplidos (de: actividad, modalidad, tipo_contrato, presupuesto,
-- ubicacion), cuántos (afinidad), por dónde calzó la actividad y por qué líneas.

-- ¿Una ubicación calza con el proceso? departamento: contenido. ciudad: igual; si SECOP no trae la
-- ciudad («No Definido» o vacío), la ciudad como palabra entera en el nombre de la entidad.
create or replace function public.fn_licitacion_ubicacion_calza(p_tipo text, p_valor text, p jsonb)
returns boolean language sql immutable parallel safe set search_path = public as $$
  select case p_tipo
    when 'departamento' then
      coalesce(fn_licitacion_norm(p ->> 'departamento_entidad'), '') like '%' || fn_licitacion_norm(p_valor) || '%'
    when 'ciudad' then
      coalesce(fn_licitacion_norm(p ->> 'ciudad_entidad'), '') = fn_licitacion_norm(p_valor)
      or (coalesce(fn_licitacion_norm(p ->> 'ciudad_entidad'), 'no definido') in ('no definido', 'no aplica')
          and ' ' || coalesce(fn_licitacion_norm(p ->> 'entidad'), '') || ' ' like '% ' || fn_licitacion_norm(p_valor) || ' %')
    else false end;
$$;

drop function if exists public.fn_licitacion_relevancia(jsonb);
create function public.fn_licitacion_relevancia(p jsonb)
returns table (criterios text[], afinidad int, actividad_por text, lineas text[])
language plpgsql stable security definer set search_path = public as $$
declare
  v_codigos    text := coalesce(p ->> 'codigo_principal_de_categoria', '') || ' ' || coalesce(p ->> 'categorias_adicionales', '');
  v_clases     text[];
  v_con_codigo boolean;
  v_texto      text := ' ' || coalesce(fn_licitacion_norm(coalesce(p ->> 'nombre_del_procedimiento', '') || ' ' || coalesce(p ->> 'descripci_n_del_procedimiento', '')), '') || ' ';
  v_hay_cat    boolean;
  v_hay_pal    boolean;
  v_valor      numeric;
  v_ok         text[] := '{}';
  v_act        text;
  v_calzaron   text[] := '{}';   -- líneas por las que calzó la actividad
begin
  v_con_codigo := v_codigos ~ '\d{8}';
  select coalesce(array_agg(distinct left(m[1], 6)), '{}') into v_clases
  from regexp_matches(v_codigos, '(\d{8})', 'g') m;
  v_clases := array(select c from unnest(v_clases) c where c <> '801116');  -- personal temporal: nunca

  select exists (select 1 from licitacion_criterios where activo and tipo = 'categoria'),
         exists (select 1 from licitacion_criterios where activo and tipo = 'palabra')
    into v_hay_cat, v_hay_pal;

  -- 1) actividad: por qué líneas calzó. Con código manda el código; sin código, las palabras.
  if v_con_codigo and v_hay_cat then
    select coalesce(array_agg(distinct coalesce(c.linea, 'sin_linea') order by coalesce(c.linea, 'sin_linea')), '{}') into v_calzaron
    from licitacion_criterios c
    where c.activo and c.tipo = 'categoria' and left(regexp_replace(c.valor, '\D', '', 'g'), 6) = any (v_clases);
    if cardinality(v_calzaron) > 0 then v_act := 'unspsc'; end if;
  elsif v_hay_pal then
    select coalesce(array_agg(distinct coalesce(c.linea, 'sin_linea') order by coalesce(c.linea, 'sin_linea')), '{}') into v_calzaron
    from licitacion_criterios c
    where c.activo and c.tipo = 'palabra'
      and fn_licitacion_palabra_calza(v_texto, c.valor);
    if cardinality(v_calzaron) > 0 then v_act := 'palabra'; end if;
  end if;

  if not v_hay_cat and not v_hay_pal then v_act := 'sin_criterio'; end if;
  if v_act is not null then v_ok := v_ok || 'actividad'::text; end if;

  -- 2) modalidad · 3) tipo de contrato: sin filas activas, cumple.
  if not exists (select 1 from licitacion_criterios where activo and tipo = 'modalidad')
     or exists (select 1 from licitacion_criterios c where c.activo and c.tipo = 'modalidad'
                and coalesce(fn_licitacion_norm(p ->> 'modalidad_de_contratacion'), '') like '%' || fn_licitacion_norm(c.valor) || '%') then
    v_ok := v_ok || 'modalidad'::text;
  end if;
  if not exists (select 1 from licitacion_criterios where activo and tipo = 'tipo_contrato')
     or exists (select 1 from licitacion_criterios c where c.activo and c.tipo = 'tipo_contrato'
                and coalesce(fn_licitacion_norm(p ->> 'tipo_de_contrato'), '') like '%' || fn_licitacion_norm(c.valor) || '%') then
    v_ok := v_ok || 'tipo_contrato'::text;
  end if;

  -- 4) presupuesto: sin rango marcado, cumple. Con rango y sin cifra en SECOP: NO cumple (el dato
  --    que falta endurece, no suaviza).
  v_valor := case when (p ->> 'precio_base') ~ '^\s*\d+(\.\d+)?\s*$' then (p ->> 'precio_base')::numeric end;
  if not exists (select 1 from licitacion_criterios where activo and tipo = 'presupuesto')
     or (v_valor > 0 and exists (select 1 from licitacion_criterios c where c.activo and c.tipo = 'presupuesto'
                                 and v_valor >= coalesce(c.valor_desde, 0)
                                 and (c.valor_hasta is null or v_valor <= c.valor_hasta))) then
    v_ok := v_ok || 'presupuesto'::text;
  end if;

  -- 5) ubicación: global (las mismas ciudades y departamentos para todas las líneas).
  if not exists (select 1 from licitacion_criterios where activo and tipo in ('departamento', 'ciudad'))
     or exists (select 1 from licitacion_criterios c where c.activo and c.tipo in ('departamento', 'ciudad')
                and fn_licitacion_ubicacion_calza(c.tipo, c.valor, p)) then
    v_ok := v_ok || 'ubicacion'::text;
  end if;

  return query select v_ok, cardinality(v_ok), v_act, case when v_act is null then '{}'::text[] else v_calzaron end;
end $$;

-- Relevante = actividad Y ubicación Y 4 o más. Una sola definición: la usan la vista y el aviso.
-- La ubicación es obligatoria (NO como en Licitta, donde es uno de cinco): Jhojan, 2026-11-07, «si
-- sabe que es ruido, ¿para qué lo determina siquiera?». Licitta le vende a todo el país;
-- Servielectro tiene técnicos en ciudades concretas, y un proceso que no puede atender no es una
-- oportunidad. Abrir una ciudad = cargar la fila 'ciudad'.
create or replace function public.fn_licitacion_es_relevante(p_criterios text[], p_afinidad numeric)
returns boolean language sql immutable parallel safe as $$
  select coalesce('actividad' = any (p_criterios) and 'ubicacion' = any (p_criterios) and p_afinidad >= 4, false);
$$;

-- ============================================================ 5) barridos
alter table public.licitacion_barridos
  add column if not exists iniciado_en  timestamptz not null default now(),
  add column if not exists terminado_en timestamptz,
  add column if not exists fuente       text not null default 'secop_ii_datos_abiertos:p6dx-8zbt',
  add column if not exists ventana_desde timestamptz,
  add column if not exists leidos       int not null default 0,
  add column if not exists con_actividad int not null default 0,
  add column if not exists relevantes   int not null default 0,
  add column if not exists nuevos       int not null default 0,
  add column if not exists sin_rup      int not null default 0,
  add column if not exists con_token    boolean;

comment on column public.licitacion_barridos.error is
  'El error de la corrida, si falló. Una corrida con terminado_en vacío y sin error = se cortó a la mitad (timeout).';

-- Abrir / cerrar / ingerir: solo la Edge Function (clave de servicio) o la base.
create or replace function public.fn_licitaciones_barrido_abrir(p_ventana_desde timestamptz, p_con_token boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  insert into licitacion_barridos (ventana_desde, con_token) values (p_ventana_desde, p_con_token)
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.fn_licitaciones_barrido_cerrar(p_barrido uuid, p_error text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update licitacion_barridos
     set terminado_en = now(), error = nullif(trim(coalesce(p_error, '')), '')
   where id = p_barrido and terminado_en is null;
  if not found then
    raise exception 'El barrido % no existe o ya estaba cerrado.', p_barrido;
  end if;
end $$;

-- Recibe un lote de filas de p6dx-8zbt. Guarda SOLO las que cumplen la actividad (relevantes o
-- no: así se ven las que quedaron a un criterio), sin duplicar por id_del_proceso. Lo de Jhojan
-- (semaforo, cumplimiento_probable, proxima_accion…) nunca se pisa.
-- SET timezone: las fechas de Datos Abiertos son hora local de Colombia sin zona.
create or replace function public.fn_licitaciones_ingerir(p_barrido uuid, p_filas jsonb)
returns jsonb language plpgsql security definer set search_path = public set timezone = 'America/Bogota' as $$
declare
  f jsonb; r record;
  v_leidos int := 0; v_act int := 0; v_rel int := 0; v_nuevos int := 0; v_sin_rup int := 0;
  v_cierre timestamp; v_publicado timestamp; v_nuevo boolean; v_rup boolean;
begin
  if jsonb_typeof(p_filas) is distinct from 'array' then
    raise exception 'Se esperaba un arreglo de filas de SECOP.';
  end if;
  if not exists (select 1 from licitacion_criterios where activo and tipo in ('categoria', 'palabra')) then
    raise exception 'No hay criterios de actividad activos: el radar traería todo SECOP. Se detiene.';
  end if;
  if not exists (select 1 from licitacion_barridos where id = p_barrido and terminado_en is null) then
    raise exception 'El barrido % no está abierto.', p_barrido;
  end if;

  for f in select value from jsonb_array_elements(p_filas) loop
    v_leidos := v_leidos + 1;
    continue when coalesce(trim(f ->> 'id_del_proceso'), '') = '';
    v_cierre := case when f ->> 'fecha_de_recepcion_de' ~ '^\d{4}-\d{2}-\d{2}' then (f ->> 'fecha_de_recepcion_de')::timestamp end;
    continue when v_cierre is not null and v_cierre < localtimestamp;   -- ya cerró: no se puede ofertar

    select * into r from fn_licitacion_relevancia(f);
    continue when not ('actividad' = any (r.criterios));
    v_act := v_act + 1;

    v_publicado := case when f ->> 'fecha_de_publicacion_del' ~ '^\d{4}-\d{2}-\d{2}' then (f ->> 'fecha_de_publicacion_del')::timestamp end;

    -- Las columnas descriptivas de Jhojan (entidad, nombre, modalidad…) se llenan desde SECOP: las
    -- lee v_licitaciones_nuevas, y entidad y nombre son NOT NULL. Una fila cargada a mano (secop
    -- null, como la de la Policía) nunca se pisa: el «where» del on conflict la deja quieta.
    v_nuevo := null; v_rup := null;
    insert into licitaciones (id_del_proceso, publicado_en, traida_en, afinidad, criterios_que_coinciden, actividad_por,
                              lineas_que_calzaron, secop,
                              referencia, entidad, nit_entidad, departamento, ciudad, nombre, descripcion, modalidad,
                              tipo_contrato, categoria_unspsc, precio_base, duracion, fase, estado_secop, url,
                              actualizado_en_secop, fecha_cierre_secop)
    values (trim(f ->> 'id_del_proceso'), v_publicado, now(), r.afinidad, r.criterios, r.actividad_por,
            r.lineas, f,
            nullif(trim(f ->> 'referencia_del_proceso'), ''),
            coalesce(nullif(trim(f ->> 'entidad'), ''), '(SECOP no trae la entidad)'),
            nullif(trim(f ->> 'nit_entidad'), ''),
            nullif(trim(f ->> 'departamento_entidad'), ''),
            nullif(trim(f ->> 'ciudad_entidad'), ''),
            coalesce(nullif(trim(f ->> 'nombre_del_procedimiento'), ''), left(nullif(trim(f ->> 'descripci_n_del_procedimiento'), ''), 300),
                     trim(f ->> 'id_del_proceso')),
            nullif(trim(f ->> 'descripci_n_del_procedimiento'), ''),
            nullif(trim(f ->> 'modalidad_de_contratacion'), ''),
            nullif(trim(f ->> 'tipo_de_contrato'), ''),
            nullif(trim(f ->> 'codigo_principal_de_categoria'), ''),
            case when (f ->> 'precio_base') ~ '^\s*\d+(\.\d+)?\s*$' then (f ->> 'precio_base')::numeric end,
            nullif(trim(coalesce(f ->> 'duracion', '') || ' ' || coalesce(f ->> 'unidad_de_duracion', '')), ''),
            nullif(trim(f ->> 'fase'), ''),
            nullif(trim(f ->> 'estado_del_procedimiento'), ''),
            nullif(trim(f -> 'urlproceso' ->> 'url'), ''),
            case when f ->> 'fecha_de_ultima_publicaci' ~ '^\d{4}-\d{2}-\d{2}' then left(f ->> 'fecha_de_ultima_publicaci', 10)::date end,
            v_cierre::date)
    on conflict (id_del_proceso) do update set
      publicado_en            = coalesce(licitaciones.publicado_en, excluded.publicado_en),
      afinidad                = excluded.afinidad,
      criterios_que_coinciden = excluded.criterios_que_coinciden,
      actividad_por           = excluded.actividad_por,
      lineas_que_calzaron     = excluded.lineas_que_calzaron,
      secop                   = excluded.secop,
      referencia = excluded.referencia, entidad = excluded.entidad, nit_entidad = excluded.nit_entidad,
      departamento = excluded.departamento, ciudad = excluded.ciudad, nombre = excluded.nombre,
      descripcion = excluded.descripcion, modalidad = excluded.modalidad, tipo_contrato = excluded.tipo_contrato,
      categoria_unspsc = excluded.categoria_unspsc, precio_base = excluded.precio_base, duracion = excluded.duracion,
      fase = excluded.fase, estado_secop = excluded.estado_secop, url = excluded.url,
      actualizado_en_secop = excluded.actualizado_en_secop, fecha_cierre_secop = excluded.fecha_cierre_secop
    where licitaciones.secop is not null
    returning (xmax = 0), requiere_rup into v_nuevo, v_rup;
    continue when v_nuevo is null;   -- chocó con una fila manual: no se tocó ni se cuenta

    if v_nuevo then v_nuevos := v_nuevos + 1; end if;
    if fn_licitacion_es_relevante(r.criterios, r.afinidad) then
      v_rel := v_rel + 1;
      if v_rup is false then v_sin_rup := v_sin_rup + 1; end if;
    end if;
  end loop;

  update licitacion_barridos
     set leidos = leidos + v_leidos, con_actividad = con_actividad + v_act, relevantes = relevantes + v_rel,
         nuevos = nuevos + v_nuevos, sin_rup = sin_rup + v_sin_rup
   where id = p_barrido;

  return jsonb_build_object('leidos', v_leidos, 'con_actividad', v_act, 'relevantes', v_rel, 'nuevos', v_nuevos, 'sin_rup', v_sin_rup);
end $$;

-- Recalcula la relevancia de lo que sigue abierto (cuando cambian los criterios: corregir el
-- perfil recalcula sin volver a bajar nada). La llama el barrido al final; también quien es
-- responsable de los criterios.
create or replace function public.fn_licitaciones_recalcular()
returns int language plpgsql security definer set search_path = public set timezone = 'America/Bogota' as $$
declare l record; r record; v_n int := 0;
begin
  -- Ojo: dentro de security definer, current_user es el dueño de la función, no quien llama.
  -- Sin usuario conectado (auth.uid() null) = la Edge Function con clave de servicio o pg_cron.
  if auth.uid() is not null
     and not coalesce(fn_tiene_permiso_seccion('licitaciones', 'criterios', 'responsable'), false) then
    raise exception 'Recalcular la relevancia es de quien es responsable de los criterios.';
  end if;
  for l in select id, secop, afinidad, criterios_que_coinciden, actividad_por, lineas_que_calzaron
           from licitaciones
           where secop is not null
             and (secop ->> 'fecha_de_recepcion_de' !~ '^\d{4}-\d{2}-\d{2}'
                  or (secop ->> 'fecha_de_recepcion_de')::timestamp >= localtimestamp)
  loop
    select * into r from fn_licitacion_relevancia(l.secop);
    if r.afinidad is distinct from l.afinidad::int or r.criterios is distinct from l.criterios_que_coinciden
       or r.actividad_por is distinct from l.actividad_por
       or r.lineas is distinct from l.lineas_que_calzaron then
      update licitaciones set afinidad = r.afinidad, criterios_que_coinciden = r.criterios, actividad_por = r.actividad_por,
                              lineas_que_calzaron = r.lineas
       where id = l.id;
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end $$;

revoke all on function public.fn_licitaciones_barrido_abrir(timestamptz, boolean) from public, anon, authenticated;
revoke all on function public.fn_licitaciones_barrido_cerrar(uuid, text) from public, anon, authenticated;
revoke all on function public.fn_licitaciones_ingerir(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.fn_licitacion_relevancia(jsonb) from public, anon;
revoke all on function public.fn_licitaciones_recalcular() from public, anon;
grant execute on function public.fn_licitaciones_barrido_abrir(timestamptz, boolean) to service_role;
grant execute on function public.fn_licitaciones_barrido_cerrar(uuid, text) to service_role;
grant execute on function public.fn_licitaciones_ingerir(uuid, jsonb) to service_role;
grant execute on function public.fn_licitacion_relevancia(jsonb) to service_role, authenticated;
grant execute on function public.fn_licitaciones_recalcular() to service_role, authenticated;

-- ============================================================ 6) el aviso: relevante y sin RUP
-- `para` admite tecnico | aprobador | rrhh | sst (ver 119). Una oportunidad es para quien decide.
insert into public.notificacion_tipos (id, nombre, descripcion, para, por_defecto, orden)
values ('licitacion_sin_rup', 'Licitación relevante que no exige RUP',
        'El radar de SECOP encontró un proceso abierto en una de nuestras ciudades, de nuestra actividad, que cumple 4 o 5 criterios y cuya modalidad no exige RUP.',
        'aprobador', true, 110)
on conflict (id) do update set nombre = excluded.nombre, descripcion = excluded.descripcion,
  para = excluded.para, orden = excluded.orden;

-- Sale de un trigger: fn_notificar exige pg_trigger_depth() > 0 (y se traga los errores: por eso
-- el tipo se registra arriba en la MISMA migración, antes del trigger).
create or replace function public.fn_licitaciones_avisar_sin_rup()
returns trigger language plpgsql security definer set search_path = public as $$
declare d uuid; v_titulo text; v_cuerpo text; v_cierre text;
begin
  if tg_op = 'UPDATE' and old.requiere_rup is false
     and fn_licitacion_es_relevante(old.criterios_que_coinciden, old.afinidad) then
    return null;  -- ya se había avisado
  end if;
  v_titulo := 'Licitación sin RUP: ' || left(coalesce(new.secop ->> 'entidad', 'SECOP II'), 60);
  v_cierre := case when new.secop ->> 'fecha_de_recepcion_de' ~ '^\d{4}-\d{2}-\d{2}'
                   then ' · cierra ' || to_char((new.secop ->> 'fecha_de_recepcion_de')::timestamp, 'DD/MM HH24:MI') end;
  -- Sin montos: esto sale en la pantalla de bloqueo (misma regla de enviar-push).
  v_cuerpo := left(coalesce(new.secop ->> 'descripci_n_del_procedimiento', new.secop ->> 'nombre_del_procedimiento', ''), 140)
              || coalesce(v_cierre, '') || ' · ' || coalesce(new.secop ->> 'modalidad_de_contratacion', '')
              || coalesce(' · ' || nullif(array_to_string(new.lineas_que_calzaron, ', '), ''), '');
  for d in select * from fn_notif_con_permiso('licitaciones', 'consultar') loop
    perform fn_notificar(d, 'licitacion_sin_rup', v_titulo, v_cuerpo, '/licitaciones', 'licitaciones', new.id, false);
  end loop;
  return null;
end $$;

drop trigger if exists trg_licitaciones_avisar_sin_rup on public.licitaciones;
create trigger trg_licitaciones_avisar_sin_rup
  after insert or update of afinidad, criterios_que_coinciden, requiere_rup on public.licitaciones
  for each row
  when (new.requiere_rup is false and new.secop is not null
        and public.fn_licitacion_es_relevante(new.criterios_que_coinciden, new.afinidad))
  execute function public.fn_licitaciones_avisar_sin_rup();

-- ============================================================ 7) documentos del proceso
create table if not exists public.licitacion_documentos (
  id             uuid primary key default gen_random_uuid(),
  licitacion_id  uuid not null references public.licitaciones (id) on delete restrict,
  tipo           text not null check (tipo in ('pliego', 'invitacion', 'estudios_previos', 'anexo_tecnico',
                                               'matriz_riesgos', 'adenda', 'aviso_convocatoria', 'otro')),
  -- Documento de reglas = de donde salen los habilitantes. El aviso de convocatoria NO lo es (no
  -- trae los habilitantes). Sin al menos uno de reglas no hay análisis.
  es_de_reglas   boolean generated always as (tipo in ('pliego', 'invitacion', 'estudios_previos',
                                                       'anexo_tecnico', 'matriz_riesgos', 'adenda')) stored,
  nombre_original text not null check (length(trim(nombre_original)) > 0),
  url_origen     text,
  path           text unique,                 -- bucket 'licitaciones': {licitacion_id}/{sha256}-{nombre}
  sha256         text check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  bytes          bigint check (bytes is null or bytes > 0),
  mime           text,
  bajado_en      timestamptz not null default now(),
  bajado_por     uuid default auth.uid() references public.perfiles (id),
  notas          text,
  -- Si hay archivo, hay huella: es lo que permite saber si una adenda cambió el documento.
  constraint licitacion_documentos_archivo check (path is null or (sha256 is not null and bytes is not null)),
  unique (licitacion_id, sha256)
);
create index if not exists idx_licitacion_documentos on public.licitacion_documentos (licitacion_id, tipo);
comment on table public.licitacion_documentos is
  'Documentos del proceso bajados de SECOP II (o subidos a mano). Mismo archivo dos veces = mismo sha256 = una fila.';

insert into storage.buckets (id, name, public, file_size_limit)
values ('licitaciones', 'licitaciones', false, 104857600)   -- 100 MB, como el tope de Licitta
on conflict (id) do nothing;

-- ============================================================ 8) requisitos: el corazón del motor
create table if not exists public.licitacion_requisitos (
  id             uuid primary key default gen_random_uuid(),
  licitacion_id  uuid not null references public.licitaciones (id) on delete restrict,
  documento_id   uuid references public.licitacion_documentos (id) on delete restrict,
  tema           text not null check (tema in ('juridico', 'capacidad_financiera', 'experiencia', 'capacidad_residual',
                                               'puntaje', 'documentos_exigidos', 'garantias', 'contrato',
                                               'requisitos_tecnicos', 'cronograma', 'causales_rechazo')),
  -- Los cuatro primeros deciden Cumple / No cumple; los otros siete no.
  decide         boolean generated always as (tema in ('juridico', 'capacidad_financiera', 'experiencia', 'capacidad_residual')) stored,
  orden          int not null default 0,
  requisito      text not null check (length(trim(requisito)) > 0),   -- «Índice de liquidez», «RUP vigente»…
  exigido        text,                                                -- lo que dice el pliego, en palabras
  exigido_valor  numeric,                                             -- la cifra, si la hay (1.2, 0.70, 500 SMMLV…)
  comparacion    text check (comparacion in ('minimo', 'maximo')),    -- ≥ exigido (liquidez) o ≤ exigido (endeudamiento)
  acreditado     text,                                                -- lo que tiene la empresa, en palabras
  acreditado_valor numeric,
  fuente_acreditado text check (fuente_acreditado in ('rup', 'rues', 'secop', 'erp', 'documento', 'manual')),
  estado         text not null check (estado in ('cumple', 'no_cumple', 'falta_el_dato', 'no_exigido')),
  razon          text,                                                -- el porqué, en una línea
  razon_no_exigido text check (razon_no_exigido in ('pliego_lo_dice', 'invitacion_no_lo_menciona')),
  pagina         int check (pagina is null or pagina > 0),
  cita           text,                                                -- el pasaje del pliego
  extraido_por_ia boolean not null default false,
  revisado_por   uuid references public.perfiles (id),
  revisado_en    timestamptz,
  creado_por     uuid default auth.uid() references public.perfiles (id),
  creado_en      timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  -- La fuente es obligatoria en lo que decide: documento + página + cita. Única excepción: en
  -- mínima cuantía, lo que la invitación NO menciona (no hay página que citar para un silencio;
  -- el documento leído sí es obligatorio).
  constraint licitacion_requisitos_fuente check (
    tema not in ('juridico', 'capacidad_financiera', 'experiencia', 'capacidad_residual')
    or (documento_id is not null and (
          (pagina is not null and length(trim(coalesce(cita, ''))) > 0)
          or (estado = 'no_exigido' and razon_no_exigido = 'invitacion_no_lo_menciona')))),

  -- NUNCA «no se encontró, así que no aplica». no_exigido solo con razón citada.
  constraint licitacion_requisitos_no_exigido check (
    case when estado = 'no_exigido' then
           razon_no_exigido is not null
           and length(trim(coalesce(razon, ''))) > 0
           and documento_id is not null
           and (razon_no_exigido <> 'pliego_lo_dice' or (pagina is not null and length(trim(coalesce(cita, ''))) > 0))
           and exigido_valor is null
         else razon_no_exigido is null end),

  -- Un «cumple» dice con qué se acredita.
  constraint licitacion_requisitos_cumple_con_que check (
    estado <> 'cumple' or length(trim(coalesce(acreditado, ''))) > 0 or acreditado_valor is not null),

  -- Con cifra exigida, hay que decir si es piso o techo.
  constraint licitacion_requisitos_comparacion check ((exigido_valor is null) = (comparacion is null))
);
create index if not exists idx_licitacion_requisitos on public.licitacion_requisitos (licitacion_id, tema, orden);

comment on table public.licitacion_requisitos is
  'Una fila por requisito del pliego (once temas de Licitta). Deciden juridico, capacidad_financiera, experiencia y capacidad_residual. Estados: cumple, no_cumple, falta_el_dato, no_exigido. no_exigido SOLO con razón citada (pliego_lo_dice + página, o invitacion_no_lo_menciona en mínima cuantía); si falta con qué verificar es falta_el_dato, jamás silencio. Con cifras, el estado lo calcula la base con tolerancia 0,001 (el borde exacto nunca descarta).';

create or replace function public.fn_licitacion_requisitos_reglas()
returns trigger language plpgsql set search_path = public as $$
declare v_doc record;
begin
  -- El documento citado es de ESTA licitación (un documento de otro proceso se leería como si fuera de este).
  if new.documento_id is not null then
    select licitacion_id, tipo into v_doc from licitacion_documentos where id = new.documento_id;
    if v_doc.licitacion_id is distinct from new.licitacion_id then
      raise exception 'El documento citado es de otra licitación.';
    end if;
    if new.razon_no_exigido = 'invitacion_no_lo_menciona' and v_doc.tipo <> 'invitacion' then
      raise exception '«No mencionado en la invitación» solo vale citando la invitación pública (mínima cuantía).';
    end if;
  end if;

  -- Con cifras, las reglas deciden (no la IA, no la persona). Tolerancia 0,001.
  if new.exigido_valor is not null then
    if new.acreditado_valor is null then
      new.estado := 'falta_el_dato';
    elsif new.comparacion = 'minimo' then
      new.estado := case when new.acreditado_valor >= new.exigido_valor
                           or abs(new.acreditado_valor - new.exigido_valor) < 0.001 then 'cumple' else 'no_cumple' end;
    else
      new.estado := case when new.acreditado_valor <= new.exigido_valor
                           or abs(new.acreditado_valor - new.exigido_valor) < 0.001 then 'cumple' else 'no_cumple' end;
    end if;
  end if;

  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_licitacion_requisitos_reglas on public.licitacion_requisitos;
create trigger trg_licitacion_requisitos_reglas
  before insert or update on public.licitacion_requisitos
  for each row execute function public.fn_licitacion_requisitos_reglas();

-- ============================================================ 9) el resultado: calculado, nunca escrito
-- cumple    = hay al menos un documento de reglas, están los temas habilitantes que aplican, y
--             TODAS sus filas están resueltas (cumple, o no_exigido con razón — el CHECK la exige).
-- no_cumple = algún habilitante no_cumple o falta_el_dato, o falta un tema entero (un tema que
--             nadie revisó es un dato que falta, no un «no aplica»).
-- null      = no se puede analizar todavía (sin documento de reglas o sin ninguna fila): ni cumple
--             ni no cumple, y motivo lo dice.
-- Capacidad residual (K) solo se exige en obra; si no se sabe el tipo de contrato (fila manual),
-- se exige: ante la duda, falta el dato.
create or replace view public.v_licitacion_resultado
with (security_invoker = true) as
with r as (
  select licitacion_id,
         count(*) filter (where decide)                                  as habilitantes,
         count(*) filter (where decide and estado = 'cumple')            as cumple,
         count(*) filter (where decide and estado = 'no_cumple')         as no_cumple,
         count(*) filter (where decide and estado = 'falta_el_dato')     as falta_el_dato,
         count(*) filter (where decide and estado = 'no_exigido')        as no_exigido,
         array_agg(distinct tema) filter (where decide)                  as temas
  from public.licitacion_requisitos group by licitacion_id
), d as (
  select licitacion_id, count(*) filter (where es_de_reglas) as documentos_de_reglas
  from public.licitacion_documentos group by licitacion_id
), base as (
  select l.id as licitacion_id, l.id_del_proceso,
         coalesce(d.documentos_de_reglas, 0) as documentos_de_reglas,
         coalesce(r.habilitantes, 0) as habilitantes, coalesce(r.cumple, 0) as cumple,
         coalesce(r.no_cumple, 0) as no_cumple, coalesce(r.falta_el_dato, 0) as falta_el_dato,
         coalesce(r.no_exigido, 0) as no_exigido,
         array(select t from unnest(
                 array['juridico', 'capacidad_financiera', 'experiencia']
                 || case when l.secop is null or public.fn_licitacion_norm(l.secop ->> 'tipo_de_contrato') like '%obra%'
                         then array['capacidad_residual'] else '{}'::text[] end) t
               where t <> all (coalesce(r.temas, '{}'))) as temas_sin_revisar
  from public.licitaciones l
  left join r on r.licitacion_id = l.id
  left join d on d.licitacion_id = l.id
)
select b.*,
       case when b.documentos_de_reglas = 0 or b.habilitantes = 0 then null
            when b.no_cumple > 0 or b.falta_el_dato > 0 or cardinality(b.temas_sin_revisar) > 0 then 'no_cumple'
            else 'cumple' end as resultado,
       case when b.documentos_de_reglas = 0 then 'Sin documento de reglas (pliego, invitación, estudios previos, anexo técnico, matriz o adenda): no se puede analizar.'
            when b.habilitantes = 0 then 'Sin requisitos habilitantes cargados: no se ha analizado.'
            when b.no_cumple > 0 then b.no_cumple || ' requisito(s) habilitante(s) no se cumplen.'
            when b.falta_el_dato > 0 then b.falta_el_dato || ' requisito(s) habilitante(s) sin con qué verificar: No cumple · falta el dato.'
            when cardinality(b.temas_sin_revisar) > 0 then 'Falta revisar: ' || array_to_string(b.temas_sin_revisar, ', ') || '.'
            else 'Pasa todos los habilitantes.' end as motivo
from base b;
comment on view public.v_licitacion_resultado is
  'Cumple / No cumple de cada licitación, calculado de licitacion_requisitos. No recomienda presentarse o no: dice qué se cumple y qué falta. No consulta SIRI, Contraloría, Policía ni deudores alimentarios (se consultan antes de presentar).';

-- La lista del radar, con lo que hay que ver de un vistazo.
create or replace view public.v_licitaciones_radar
with (security_invoker = true) as
-- Las columnas descriptivas son las de Jhojan (el barrido las llena desde SECOP; una fila cargada a
-- mano, como la de la Policía, trae las suyas).
select l.id, l.id_del_proceso,
       l.entidad, l.departamento, l.ciudad,
       coalesce(l.descripcion, l.nombre)                 as objeto,
       l.modalidad, l.tipo_contrato,
       l.precio_base                                     as presupuesto,
       case when l.secop ->> 'fecha_de_recepcion_de' ~ '^\d{4}-\d{2}-\d{2}'
            then (l.secop ->> 'fecha_de_recepcion_de')::timestamp end as cierra_en,   -- hora de Colombia
       l.url                                             as url_secop,
       l.publicado_en, l.traida_en, l.dias_publicado_al_traer,
       l.requiere_rup, l.afinidad,
       -- El anillo de Licitta: los cinco, cuáles se cumplieron y cuáles faltaron. Solo en filas del
       -- radar: en las manuales criterios_que_coinciden trae otra cosa (los valores que calzaron,
       -- p. ej. «CERCO ELECTRICO», como lo cargó Jhojan) y no se reinterpreta.
       l.criterios_que_coinciden,
       case when l.secop is null or l.criterios_que_coinciden is null then null else
         array(select c from unnest(array['actividad', 'modalidad', 'tipo_contrato', 'presupuesto', 'ubicacion']) with ordinality u(c, o)
               where c <> all (l.criterios_que_coinciden) order by o) end as criterios_faltantes,
       l.actividad_por,
       l.lineas_que_calzaron,
       l.semaforo,
       case when l.secop is not null then public.fn_licitacion_es_relevante(l.criterios_que_coinciden, l.afinidad) end as relevante,
       case when l.secop is null then 'manual' else 'secop_ii_datos_abiertos' end as origen
from public.licitaciones l;

-- ============================================================ 10) expediente: VISTAS, no tablas
-- Una sola fuente, muchas vistas. Hoy empleados tiene una fila de prueba: estas vistas salen casi
-- vacías, y eso es lo correcto. Columnas verificadas contra las migraciones 05, 66, 75, 107, 128 y
-- el uso de v_cotizacion_totales_iva en la app.

-- Personal: las personas reales con sus certificados y vigencias (SG-SST). La historia clínica
-- nunca sale de acá.
create or replace view public.v_expediente_personal
with (security_invoker = true) as
select e.id as empleado_id,
       trim(e.primer_nombre || ' ' || e.primer_apellido) as nombre,
       e.cargo, e.titulacion, e.fecha_ingreso,
       d.id as documento_id, d.tipo, coalesce(d.nombre, d.tema) as documento, d.nivel, d.horas, d.entidad,
       d.vigente_desde, d.vence_en,
       d.vence_en - (now() at time zone 'America/Bogota')::date as dias_para_vencer,
       case when d.id is null then 'falta_el_dato'
            when d.vence_en is null then 'sin_vencimiento'
            when d.vence_en < (now() at time zone 'America/Bogota')::date then 'vencido'
            else 'vigente' end as estado,
       d.path is not null as tiene_archivo,
       d.verificado_en is not null as verificado,
       'persona_documentos' as fuente
from public.empleados e
left join public.persona_documentos d
       on d.empleado_id = e.id and not d.archivado and d.tipo <> 'historia_clinica'
where e.estado_laboral = 'activo';

-- Experiencia: proyectos ejecutados con su cliente, valor y acta de inicio firmada.
-- Valor = total de la cotización aprobada (fuente_valor lo dice: no es el valor del contrato
-- firmado si cambió). No hay plantilla de acta de terminación todavía: no se finge.
create or replace view public.v_expediente_experiencia
with (security_invoker = true) as
select p.id as proyecto_id, p.codigo, p.nombre, c.nombre as cliente, c.nit as cliente_nit,
       p.estado, p.tipo_contrato, p.contrato_firmado,
       p.fecha_inicio, p.fecha_cierre,
       t.total_cotizacion as valor, 'cotizacion_aprobada' as fuente_valor,
       ai.id as acta_inicio_id, ai.sellado_en as acta_inicio_sellada_en,
       'proyectos' as fuente
from public.proyectos p
join public.clientes c on c.id = p.cliente_id
left join public.v_cotizacion_totales_iva t on t.cotizacion_id = p.cotizacion_aprobada_id
left join lateral (
  select f.id, f.sellado_en
  from public.sst_formatos f
  join public.sst_plantillas pl on pl.id = f.plantilla_id
  where f.proyecto_id = p.id and pl.codigo = 'PRY-ACTA-INICIO' and f.estado in ('firmado', 'aprobado')
  order by f.sellado_en desc nulls last
  limit 1
) ai on true;

-- Financiero: del espejo de Siigo (balance general, sin tercero), por período.
-- Toma, para cada prefijo PUC, el nivel más agregado que exista (la cuenta de 1 o 2 dígitos si
-- Siigo la trae; si no, la suma del nivel más corto) para no contar dos veces.
-- Liquidez y capital de trabajo NO se calculan: el PUC no separa corriente de no corriente; salen
-- del RUP o de los estados financieros. Quedan null = falta el dato, no cero.
-- Cobertura de intereses con gastos de intereses en cero = INDETERMINADO → cumple salvo utilidad
-- operacional negativa (Documentos Tipo de Colombia Compra); se marca en cobertura_estado.
-- Las cifras van en valor absoluto por clase: el signo de Siigo por naturaleza no está verificado.
create or replace function public.fn_siigo_saldo(p_anio int, p_mes int, p_prefijo text)
returns numeric language sql stable security invoker set search_path = public as $$
  with b as (
    select cuenta, saldo_final from siigo_balance
    where anio = p_anio and mes = p_mes and identificacion is null and cuenta like p_prefijo || '%'
  )
  select abs(sum(saldo_final)) from b where length(cuenta) = (select min(length(cuenta)) from b);
$$;

create or replace view public.v_expediente_financiero
with (security_invoker = true) as
with periodos as (
  select distinct anio, mes from public.siigo_balance where identificacion is null
), x as (
  select anio, mes,
         public.fn_siigo_saldo(anio, mes, '1')    as activo_total,
         public.fn_siigo_saldo(anio, mes, '2')    as pasivo_total,
         public.fn_siigo_saldo(anio, mes, '3')    as patrimonio,
         public.fn_siigo_saldo(anio, mes, '41')   as ingresos_operacionales,
         public.fn_siigo_saldo(anio, mes, '51')   as gastos_administracion,
         public.fn_siigo_saldo(anio, mes, '52')   as gastos_ventas,
         public.fn_siigo_saldo(anio, mes, '6')    as costo_ventas,
         public.fn_siigo_saldo(anio, mes, '5305') as gastos_financieros
  from periodos
), y as (
  select x.*, coalesce(ingresos_operacionales, 0) - coalesce(costo_ventas, 0)
              - coalesce(gastos_administracion, 0) - coalesce(gastos_ventas, 0) as utilidad_operacional
  from x
)
select anio, mes, mes in (12, 13) as es_cierre,
       activo_total, pasivo_total, patrimonio, utilidad_operacional, gastos_financieros,
       null::numeric as liquidez, null::numeric as capital_de_trabajo,
       round(pasivo_total / nullif(activo_total, 0), 4) as endeudamiento,
       case when coalesce(gastos_financieros, 0) = 0 then null
            else round(utilidad_operacional / gastos_financieros, 4) end as cobertura_intereses,
       case when coalesce(gastos_financieros, 0) = 0 and utilidad_operacional >= 0 then 'indeterminado_cumple'
            when coalesce(gastos_financieros, 0) = 0 then 'indeterminado_utilidad_negativa'
            else 'cifra' end as cobertura_estado,
       round(utilidad_operacional / nullif(patrimonio, 0), 4) as rentabilidad_patrimonio,
       round(utilidad_operacional / nullif(activo_total, 0), 4) as rentabilidad_activo,
       'siigo_balance (PUC; el RUP certificado manda)' as fuente
from y;

-- ============================================================ 11) seguridad
alter table public.licitacion_documentos enable row level security;
alter table public.licitacion_requisitos enable row level security;

do $$
declare r record;
begin
  for r in select policyname, tablename from pg_policies
           where schemaname = 'public' and tablename in ('licitacion_documentos', 'licitacion_requisitos')
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- Ver: quien ve Oportunidades. Escribir: quien trabaja ahí. Borrar: solo documentos/requisitos
-- (la evidencia del análisis), y solo el responsable.
create policy licitacion_documentos_ver on public.licitacion_documentos for select to authenticated
  using (public.fn_permiso_seccion('licitaciones', 'oportunidades') is not null);
create policy licitacion_documentos_crear on public.licitacion_documentos for insert to authenticated
  with check (public.fn_tiene_permiso_seccion('licitaciones', 'oportunidades', 'trabajar'));
create policy licitacion_documentos_editar on public.licitacion_documentos for update to authenticated
  using (public.fn_tiene_permiso_seccion('licitaciones', 'oportunidades', 'trabajar'))
  with check (public.fn_tiene_permiso_seccion('licitaciones', 'oportunidades', 'trabajar'));
create policy licitacion_documentos_borrar on public.licitacion_documentos for delete to authenticated
  using (public.fn_tiene_permiso_seccion('licitaciones', 'oportunidades', 'responsable'));

create policy licitacion_requisitos_ver on public.licitacion_requisitos for select to authenticated
  using (public.fn_permiso_seccion('licitaciones', 'oportunidades') is not null);
create policy licitacion_requisitos_crear on public.licitacion_requisitos for insert to authenticated
  with check (public.fn_tiene_permiso_seccion('licitaciones', 'oportunidades', 'trabajar'));
create policy licitacion_requisitos_editar on public.licitacion_requisitos for update to authenticated
  using (public.fn_tiene_permiso_seccion('licitaciones', 'oportunidades', 'trabajar'))
  with check (public.fn_tiene_permiso_seccion('licitaciones', 'oportunidades', 'trabajar'));
create policy licitacion_requisitos_borrar on public.licitacion_requisitos for delete to authenticated
  using (public.fn_tiene_permiso_seccion('licitaciones', 'oportunidades', 'responsable'));

revoke all on public.licitacion_documentos, public.licitacion_requisitos from anon;
grant select, insert, update, delete on public.licitacion_documentos, public.licitacion_requisitos to authenticated;

revoke all on public.v_licitacion_resultado, public.v_licitaciones_radar, public.v_expediente_personal,
              public.v_expediente_experiencia, public.v_expediente_financiero from anon;
grant select on public.v_licitacion_resultado, public.v_licitaciones_radar, public.v_expediente_personal,
                public.v_expediente_experiencia, public.v_expediente_financiero to authenticated;
revoke all on function public.fn_siigo_saldo(int, int, text) from public, anon;
grant execute on function public.fn_siigo_saldo(int, int, text) to authenticated;
