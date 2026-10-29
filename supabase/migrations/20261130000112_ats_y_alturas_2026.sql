-- FOR-14 ATS y FOR-15 Permiso de trabajo en alturas, versiones 2026 del papel (2026-10-30). Pedido
-- de Jhojan: "tomes el formato tal cual como está, lo armes tipo consulta y para llenarlo... que
-- salga el mismo... y generale el botón de vista previa". Fuente: OneDrive\BACKUP\COMERCIAL\
-- CLIENTES 2026\NATRIO SAS\PERMISOS DE TRABAJO (FOR-14 v02 del 08/04/2026, FOR-15 v02 del
-- 05/06/2026), no las de 2024.
--
-- Lo que el motor (75/83/85/88/95) no podía representar y aquí se agrega, sin tablas nuevas:
--   G1  filas FIJAS en una tabla (los 5 pasos, los EPP, los 18 ítems de chequeo): campo.filas.
--       La respuesta es { fila: { columna: valor } }. Solo forma: lo valida fn_sst_campos_problema.
--   G2  texto_largo como tipo de columna de tabla.
--   G3  casillas SI / NO / N/A: una columna 'lista' con "marcas": true (es presentación).
--   G5  varias firmas distintas: no hizo falta. sst_formato_firmas no tiene restricción única por
--       (formato, rol); el ATS pide autoriza (responsable_sst), supervisa (otro) y trabajadores
--       (tecnico), y el FOR-15 autorizador (responsable_sst) y ejecutores (tecnico): cada bloque
--       tiene su rol, así que NO se agrega la columna "pedida" ni roles nuevos.
--   G7  datos por persona en la lista de técnicos (las columnas del FOR-15): firma.columnas en la
--       plantilla; los valores van dentro de tecnicos_en_obra (sellados con el contenido, entran al
--       hash). Hoy sí/no a mano; cada columna dice de qué dato de Personal saldrá ("vigencia_de")
--       y se evaluará a la fecha de la firma, no a hoy. La autodeclaración de acrofobia, epilepsia,
--       mareos o vértigo espera NO ("esperado": false).
--   G11 código, versión y fecha del documento de papel: sst_plantillas.control (jsonb). No es la
--       versión interna del motor (que cuenta publicaciones): es la del control documental.
--   G12 textos fijos (la Res. 4272 de 2021, art. 15; las declaraciones del autorizador y del
--       ejecutor): campo.texto en una sección.
--   G17 FIRMA DIARIA (lunes a sábado): firma.diaria. El día de cada firma sale de
--       firmada_en_dispositivo en hora de Bogotá. El contenido se sigue sellando con la primera
--       firma y el formato sigue recibiendo firmas mientras está en borrador (95): las de los demás
--       días se suman sin reescribir nada. Lo único que cambia en la base: con firma diaria, un
--       técnico de la lista firma UNA VEZ POR DÍA (antes, una vez en total), y los bloques diarios
--       de un solo firmante (autoriza, supervisa) también una vez por día.
--
-- PENDIENTE de confirmar con Jhojan y Victoria: el FOR-15 de 2026 ya no trae la columna
-- "constancia de capacitación o certificado de competencia en alturas vigente" que exige la Res.
-- 4272 de 2021 y que sí tenía el de 2024. No se agrega al papel (la plantilla sigue el de 2026).
--
-- Simplificado respecto al papel (G6): la sección 6 del FOR-15 (CIERRE) se diligencia al final de
-- la semana, y el contenido queda sellado con la primera firma del lunes; por ahora la vista
-- previa la deja en blanco para llenarla a mano. Igual el "consecutivo" (G16): texto a mano.
--
-- Si ya había plantillas FOR-14 o FOR-15 publicadas en SG-SST, quedan ARCHIVADAS con su motivo
-- (no se borran; los formatos ya llenados con ellas no cambian).
--
-- Va después de la 88 y la 95. Idempotente.
-- Verificación: supabase/verificaciones/20261130000112_verificar.sql
-- Rollback:     supabase/rollbacks/20261130000112_ats_y_alturas_2026_down.sql

-- ============================================================ 1) control documental (G11)
alter table public.sst_plantillas add column if not exists control jsonb;
alter table public.sst_plantillas drop constraint if exists sst_plantillas_control;
alter table public.sst_plantillas add constraint sst_plantillas_control
  check (control is null or jsonb_typeof(control) = 'object');
comment on column public.sst_plantillas.control is
  'Control documental del papel: {"codigo": "FOR-14", "version": "02", "fecha": "2026-04-08"}. No es la versión interna del motor.';

-- ============================================================ 2) la forma de una plantilla (G1, G2, G7)
-- Igual que en la 75, con: texto_largo en columnas, filas fijas y columnas por persona en firmas.
create or replace function public.fn_sst_campos_problema(p_campos jsonb, p_firmas jsonb)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  c jsonb;
  col jsonb;
  fi jsonb;
  ids text[] := '{}';
  idsc text[];
  tipos text[] := array['seccion', 'texto', 'texto_largo', 'numero', 'si_no', 'lista', 'fecha', 'hora', 'foto', 'firma', 'ubicacion', 'tabla'];
  tipos_col text[] := array['texto', 'texto_largo', 'numero', 'si_no', 'lista', 'fecha', 'hora'];
  f jsonb;
begin
  if jsonb_typeof(p_campos) is distinct from 'array' then
    return 'Los campos tienen que ser una lista.';
  end if;
  if jsonb_array_length(p_campos) = 0 then
    return 'La plantilla no tiene campos.';
  end if;
  for c in select * from jsonb_array_elements(p_campos) loop
    if jsonb_typeof(c) <> 'object' or coalesce(c ->> 'id', '') !~ '^[a-z0-9_]{1,40}$' then
      return format('Un campo tiene un identificador inválido (%s): solo minúsculas, números y _.', coalesce(c ->> 'id', 'vacío'));
    end if;
    if (c ->> 'id') = any (ids) then
      return format('El identificador "%s" está repetido.', c ->> 'id');
    end if;
    ids := ids || (c ->> 'id');
    if not (coalesce(c ->> 'tipo', '') = any (tipos)) then
      return format('El campo "%s" tiene un tipo que no existe (%s).', c ->> 'id', coalesce(c ->> 'tipo', 'vacío'));
    end if;
    if length(trim(coalesce(c ->> 'etiqueta', ''))) = 0 then
      return format('El campo "%s" no tiene nombre.', c ->> 'id');
    end if;
    if c ->> 'tipo' = 'lista' and (jsonb_typeof(c -> 'opciones') is distinct from 'array' or jsonb_array_length(c -> 'opciones') = 0) then
      return format('La lista "%s" no tiene opciones.', c ->> 'etiqueta');
    end if;
    if c ->> 'tipo' = 'tabla' then
      if jsonb_typeof(c -> 'columnas') is distinct from 'array' or jsonb_array_length(c -> 'columnas') = 0 then
        return format('La tabla "%s" no tiene columnas.', c ->> 'etiqueta');
      end if;
      idsc := '{}';
      for col in select * from jsonb_array_elements(c -> 'columnas') loop
        if coalesce(col ->> 'id', '') !~ '^[a-z0-9_]{1,40}$' or (col ->> 'id') = any (idsc) then
          return format('La tabla "%s" tiene una columna con identificador inválido o repetido.', c ->> 'etiqueta');
        end if;
        idsc := idsc || (col ->> 'id');
        if not (coalesce(col ->> 'tipo', '') = any (tipos_col)) or length(trim(coalesce(col ->> 'etiqueta', ''))) = 0 then
          return format('La tabla "%s" tiene una columna sin nombre o de un tipo que no va en tablas.', c ->> 'etiqueta');
        end if;
        if col ->> 'tipo' = 'lista' and (jsonb_typeof(col -> 'opciones') is distinct from 'array' or jsonb_array_length(col -> 'opciones') = 0) then
          return format('La columna "%s" de "%s" no tiene opciones.', col ->> 'etiqueta', c ->> 'etiqueta');
        end if;
      end loop;
      -- Filas fijas (G1): con id y nombre, sin repetir.
      if c ? 'filas' then
        if jsonb_typeof(c -> 'filas') <> 'array' then
          return format('Las filas fijas de "%s" tienen que ser una lista.', c ->> 'etiqueta');
        end if;
        idsc := '{}';
        for fi in select * from jsonb_array_elements(c -> 'filas') loop
          if coalesce(fi ->> 'id', '') !~ '^[a-z0-9_]{1,40}$' or (fi ->> 'id') = any (idsc) or length(trim(coalesce(fi ->> 'etiqueta', ''))) = 0 then
            return format('La tabla "%s" tiene una fila fija repetida, inválida o sin nombre.', c ->> 'etiqueta');
          end if;
          idsc := idsc || (fi ->> 'id');
        end loop;
      end if;
    end if;
  end loop;
  if jsonb_typeof(p_firmas) is distinct from 'array' then
    return 'Las firmas tienen que ser una lista.';
  end if;
  for f in select * from jsonb_array_elements(p_firmas) loop
    if not (coalesce(f ->> 'rol', '') = any (array['tecnico', 'responsable_sst', 'sst_cliente', 'otro'])) then
      return format('La firma "%s" tiene un rol que no existe.', coalesce(f ->> 'etiqueta', '?'));
    end if;
    if length(trim(coalesce(f ->> 'etiqueta', ''))) = 0 then
      return 'Una firma no tiene nombre (ej. "SST del cliente").';
    end if;
    -- Columnas por persona (G7): solo en el bloque de técnicos, sí/no, con id y nombre.
    if f ? 'columnas' then
      if f ->> 'rol' <> 'tecnico' or jsonb_typeof(f -> 'columnas') <> 'array' then
        return format('Los datos por persona solo van en el bloque de técnicos ("%s").', f ->> 'etiqueta');
      end if;
      idsc := '{}';
      for col in select * from jsonb_array_elements(f -> 'columnas') loop
        if coalesce(col ->> 'id', '') !~ '^[a-z0-9_]{1,40}$' or (col ->> 'id') = any (idsc) or (col ->> 'id') in ('nombre', 'documento')
           or coalesce(col ->> 'tipo', '') <> 'si_no' or length(trim(coalesce(col ->> 'etiqueta', ''))) = 0 then
          return format('Un dato por persona de "%s" tiene identificador inválido o repetido, no es sí/no o no tiene nombre.', f ->> 'etiqueta');
        end if;
        idsc := idsc || (col ->> 'id');
      end loop;
    end if;
  end loop;
  return null;
end;
$$;

-- ============================================================ 3) firma diaria (G17)
-- ¿El bloque de ese rol se firma una vez por día? Lectura para el trigger de firmas: SIN filtro de
-- permiso (regla de la 88), y solo responde dentro de un trigger.
create or replace function public.fn_sst_firma_diaria(p_formato_id uuid, p_rol text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(bool_or(coalesce((x ->> 'diaria')::boolean, false)), false)
  from sst_formatos f join sst_plantillas p on p.id = f.plantilla_id, jsonb_array_elements(p.firmas) x
  where f.id = p_formato_id and x ->> 'rol' = p_rol and pg_trigger_depth() > 0;
$$;
revoke all on function public.fn_sst_firma_diaria(uuid, text) from public, anon;
grant execute on function public.fn_sst_firma_diaria(uuid, text) to authenticated, service_role;

-- Igual que en la 88, con la regla diaria: con firma diaria, "ya firmó" es "ya firmó ESE DÍA".
create or replace function public.fn_sst_tecnicos_firma()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_lista jsonb;
  v_dia date;
begin
  if current_user in ('postgres', 'supabase_admin') then
    return new;
  end if;
  if fn_sst_firma_existe(new.id) then
    return new;
  end if;
  v_lista := fn_sst_tecnicos_de(new.formato_id);
  v_dia := (new.firmada_en_dispositivo at time zone 'America/Bogota')::date;
  -- Formato nuevo (todavía sin firmas): si la plantilla pide técnicos, primero la lista.
  if not fn_sst_formato_tiene_firmas(new.formato_id) and fn_sst_pide_tecnicos(new.formato_id)
     and coalesce(jsonb_array_length(v_lista), 0) = 0 then
    raise exception 'Antes de firmar, anota los técnicos que estuvieron en la obra (nombre y cédula): firman todos.';
  end if;
  if new.rol = 'tecnico' and v_lista is not null then
    if not exists (select 1 from jsonb_array_elements(v_lista) t where fn_sst_doc(t ->> 'documento') = fn_sst_doc(new.documento)) then
      raise exception 'La cédula % no está en la lista de técnicos que estuvieron en la obra.', new.documento;
    end if;
    if fn_sst_firma_diaria(new.formato_id, 'tecnico') then
      if exists (select 1 from sst_formato_firmas s where s.formato_id = new.formato_id and s.rol = 'tecnico'
                 and fn_sst_doc(s.documento) = fn_sst_doc(new.documento)
                 and (s.firmada_en_dispositivo at time zone 'America/Bogota')::date = v_dia) then
        raise exception 'Ese técnico ya firmó este formato el %.', to_char(v_dia, 'DD/MM/YYYY');
      end if;
    elsif exists (select 1 from sst_formato_firmas s where s.formato_id = new.formato_id and s.rol = 'tecnico'
                  and fn_sst_doc(s.documento) = fn_sst_doc(new.documento)) then
      raise exception 'Ese técnico ya firmó este formato.';
    end if;
  end if;
  -- Bloques diarios de un firmante (autoriza, supervisa): uno por día.
  if new.rol <> 'tecnico' and fn_sst_firma_diaria(new.formato_id, new.rol)
     and exists (select 1 from sst_formato_firmas s where s.formato_id = new.formato_id and s.rol = new.rol
                 and (s.firmada_en_dispositivo at time zone 'America/Bogota')::date = v_dia) then
    raise exception 'Ese bloque ya tiene su firma del %.', to_char(v_dia, 'DD/MM/YYYY');
  end if;
  return new;
end;
$$;
revoke all on function public.fn_sst_tecnicos_firma() from public, anon, authenticated;

-- ============================================================ 4) las dos plantillas, publicadas
-- Las anteriores de esos códigos en SG-SST (si alguien armó una) quedan archivadas.
update public.sst_plantillas
   set estado = 'archivada', archivada_en = now(),
       motivo_archivo = 'Reemplazada por la versión 2026 del papel (migración 112).'
 where ambito = 'sgsst' and codigo in ('FOR-14', 'FOR-15') and estado = 'publicada'
   and id not in ('00000000-0000-4000-8000-000000112a14', '00000000-0000-4000-8000-000000112a15');

insert into public.sst_plantillas (id, codigo, nombre, version, descripcion, campos, firmas, estado, ambito, control, publicada_en, creada_por)
select '00000000-0000-4000-8000-000000112a14', 'FOR-14', 'Análisis de trabajo seguro (ATS)',
       coalesce((select max(version) from public.sst_plantillas where codigo = 'FOR-14'), 0) + 1,
       'ATS semanal: se elabora una vez y cada día de la semana (lunes a sábado) firman el que autoriza, el que supervisa y cada trabajador.',
$campos$[
  {"id": "area", "tipo": "texto", "etiqueta": "Área o dependencia", "obligatorio": true},
  {"id": "herramientas", "tipo": "texto_largo", "etiqueta": "Herramientas o equipos", "obligatorio": true},
  {"id": "consecutivo", "tipo": "texto", "etiqueta": "Número consecutivo de formato"},
  {"id": "valido_hasta", "tipo": "fecha", "etiqueta": "Válido hasta", "obligatorio": true,
   "ayuda": "La fecha de expedición es la fecha del formato. El ATS sirve para la semana: cada día firman de nuevo."},
  {"id": "hora_inicio", "tipo": "hora", "etiqueta": "Hora de inicio de la tarea"},
  {"id": "hora_fin", "tipo": "hora", "etiqueta": "Hora de terminación de la tarea"},
  {"id": "tipo_actividad", "tipo": "lista", "etiqueta": "Tipo de actividad", "opciones": ["Rutinaria", "No Rutinaria"], "obligatorio": true},
  {"id": "descripcion_actividad", "tipo": "texto_largo", "etiqueta": "Descripción de la actividad", "obligatorio": true},
  {"id": "pasos", "tipo": "tabla", "etiqueta": "Análisis paso a paso",
   "columnas": [
     {"id": "tarea", "tipo": "texto_largo", "etiqueta": "Descripción de la tarea (paso a paso)"},
     {"id": "peligros", "tipo": "texto_largo", "etiqueta": "Peligros existentes"},
     {"id": "consecuencias", "tipo": "texto_largo", "etiqueta": "Consecuencias (personas - propiedad - medio ambiente)"},
     {"id": "controles", "tipo": "texto_largo", "etiqueta": "Controles requeridos"},
     {"id": "revisado", "tipo": "texto", "etiqueta": "Revisado y aprobado"}],
   "filas": [
     {"id": "alistamiento", "etiqueta": "1) Alistamiento"},
     {"id": "desplazamiento", "etiqueta": "2) Desplazamiento"},
     {"id": "ingreso", "etiqueta": "3) Ingreso a la zona a operar"},
     {"id": "realizacion", "etiqueta": "4) Realización de la tarea"},
     {"id": "finalizacion", "etiqueta": "5) Finalización de la tarea"}]},
  {"id": "sec_epp", "tipo": "seccion", "etiqueta": "2. Equipos de protección individual (EPP)"},
  {"id": "epp", "tipo": "tabla", "etiqueta": "Especificar EPP",
   "columnas": [{"id": "uso", "tipo": "lista", "etiqueta": "Uso", "opciones": ["SI", "NO", "N/A"], "marcas": true}],
   "filas": [
     {"id": "casco", "etiqueta": "Casco con Barbuquejo"},
     {"id": "tapa_oidos", "etiqueta": "Tapa oídos"},
     {"id": "monogafas", "etiqueta": "Monogafas"},
     {"id": "overol", "etiqueta": "Overol"},
     {"id": "guantes", "etiqueta": "Guantes"},
     {"id": "tapabocas", "etiqueta": "Tapabocas"},
     {"id": "botas_seguridad", "etiqueta": "Botas de seguridad"},
     {"id": "botas_caucho", "etiqueta": "Botas de Caucho"}]},
  {"id": "epp_otros", "tipo": "texto", "etiqueta": "Otros: ¿Cuáles?"},
  {"id": "sec_equipo", "tipo": "seccion", "etiqueta": "3. Equipo que elabora el ATS",
   "ayuda": "Firman cada día de la semana (lunes a sábado): el que autoriza la labor, el que supervisa y cada trabajador de la lista."},
  {"id": "observaciones", "tipo": "texto_largo", "etiqueta": "Observaciones"}
]$campos$::jsonb,
$firmas$[
  {"rol": "responsable_sst", "etiqueta": "Encargado y/o responsable quien autoriza la labor", "obligatoria": true, "diaria": true},
  {"rol": "otro", "etiqueta": "Persona que supervisa la actividad", "obligatoria": true, "diaria": true},
  {"rol": "tecnico", "etiqueta": "Datos del trabajador", "obligatoria": true, "diaria": true}
]$firmas$::jsonb,
       'publicada', 'sgsst', '{"codigo": "FOR-14", "version": "02", "fecha": "2026-04-08"}'::jsonb, now(), null
where not exists (select 1 from public.sst_plantillas where id = '00000000-0000-4000-8000-000000112a14');

insert into public.sst_plantillas (id, codigo, nombre, version, descripcion, campos, firmas, estado, ambito, control, publicada_en, creada_por)
select '00000000-0000-4000-8000-000000112a15', 'FOR-15', 'Permiso de trabajo en alturas',
       coalesce((select max(version) from public.sst_plantillas where codigo = 'FOR-15'), 0) + 1,
       'Permiso semanal: el autorizador firma al abrirlo y cada ejecutor firma cada día (lunes a sábado).',
$campos$[
  {"id": "sec_permiso", "tipo": "seccion", "etiqueta": "Permiso de trabajo en altura",
   "texto": "Resolución 4272 de 2021, Artículo 15.  El permiso de trabajo en alturas es un mecanismo que mediante la verificación y control previo de todos los aspectos relacionados en la presente resolución, tiene como objeto prevenir la ocurrencia de accidentes durante la realización de trabajos en alturas.\nTodos los trabajos en alturas deben obedecer a una acción planificada, organizada y ejecutada por trabajadores autorizados que debe verse reflejada en los controles administrativos como el Permiso de trabajo, el cuál es obligatorio en todos los trabajos en altura independiente de su frecuencia de ejecución."},
  {"id": "sec_datos", "tipo": "seccion", "etiqueta": "1. Datos básicos del permiso de trabajo en altura"},
  {"id": "tipo_trabajo", "tipo": "lista", "etiqueta": "Tipo de trabajo", "opciones": ["Rutinario", "Ocasional"], "obligatorio": true},
  {"id": "altura_m", "tipo": "numero", "etiqueta": "Altura aproximada a la cual se va a desarrollar la actividad", "unidad": "mts.", "obligatorio": true},
  {"id": "direccion", "tipo": "texto", "etiqueta": "Dirección"},
  {"id": "ciudad", "tipo": "texto", "etiqueta": "Ciudad"},
  {"id": "lugar_trabajo", "tipo": "texto", "etiqueta": "Lugar de trabajo"},
  {"id": "area_proceso", "tipo": "texto", "etiqueta": "Área/Proceso"},
  {"id": "vigencia_permiso", "tipo": "texto", "etiqueta": "Vigencia del permiso", "obligatorio": true,
   "ayuda": "Ej.: del 3 al 8 de noviembre. La fecha de realización es la fecha del formato; cada día firman los ejecutores."},
  {"id": "hora_inicio", "tipo": "hora", "etiqueta": "Hora de inicio"},
  {"id": "hora_fin", "tipo": "hora", "etiqueta": "Hora de finalización"},
  {"id": "sec_descripcion", "tipo": "seccion", "etiqueta": "2. Descripción del trabajo a realizar"},
  {"id": "pasos", "tipo": "tabla", "etiqueta": "Pasos del trabajo",
   "columnas": [
     {"id": "tarea", "tipo": "texto_largo", "etiqueta": "Descripción de la tarea"},
     {"id": "peligros", "tipo": "texto_largo", "etiqueta": "Identificación de peligros"},
     {"id": "consecuencias", "tipo": "texto_largo", "etiqueta": "Consecuencias"},
     {"id": "controles", "tipo": "texto_largo", "etiqueta": "Controles existentes"},
     {"id": "revisado", "tipo": "texto", "etiqueta": "Revisado y aprobado"}],
   "filas": [
     {"id": "ingreso", "etiqueta": "1) Ingreso"},
     {"id": "alistar", "etiqueta": "2) Alistar herramientas manuales y eléctricas, químicos, EPCC como"},
     {"id": "traslado", "etiqueta": "3) Traslado"},
     {"id": "ejecucion", "etiqueta": "4) Ejecución de la tarea"},
     {"id": "finalizacion", "etiqueta": "5) Finalización"}]},
  {"id": "sec_medidas", "tipo": "seccion", "etiqueta": "3. Medidas de prevención y protección"},
  {"id": "medidas_prevencion", "tipo": "lista", "multiple": true, "etiqueta": "Medidas de prevención a utilizar",
   "opciones": ["Delimitación", "Señalización", "Línea de advertencia", "Barandas", "Manejo de desniveles", "Control en superficies con huecos o aberturas", "Ayudante de seguridad"]},
  {"id": "sistemas_acceso", "tipo": "lista", "multiple": true, "etiqueta": "Sistemas de acceso a utilizar",
   "opciones": ["Banca Metalica", "Escalera de extensión", "Escalera tipo gato", "Escaleras", "Elevador de Personas", "Grúa con canasta", "Tioff", "Otro"]},
  {"id": "sistemas_acceso_cual", "tipo": "texto", "etiqueta": "Cuál (otro sistema de acceso)"},
  {"id": "otras_tar", "tipo": "si_no", "etiqueta": "¿Se involucran otras TAR (tareas de alto riesgo)?"},
  {"id": "otras_tar_cuales", "tipo": "lista", "multiple": true, "etiqueta": "¿Cuáles TAR?", "opciones": ["Espacios Confinados", "Trabajo en caliente", "Energías Peligrosas"]},
  {"id": "otras_tar_otras", "tipo": "texto", "etiqueta": "Otras (¿cuáles?)"},
  {"id": "epcc", "tipo": "tabla", "etiqueta": "Equipos de protección contra caídas y elementos de protección personal",
   "columnas": [{"id": "uso", "tipo": "lista", "etiqueta": "Uso", "opciones": ["Sí", "NA"], "marcas": true}],
   "filas": [
     {"id": "anclaje_movil", "etiqueta": "Anclaje móvil"},
     {"id": "linea_vertical", "etiqueta": "Línea de vida vertical"},
     {"id": "linea_horizontal", "etiqueta": "Línea de vida horizontal"},
     {"id": "arnes", "etiqueta": "Arnés de cuerpo entero"},
     {"id": "eslinga_posicionamiento", "etiqueta": "Eslinga de posicionamiento y/o restricción"},
     {"id": "silla", "etiqueta": "Silla de suspensión"},
     {"id": "guantes", "etiqueta": "Guantes de seguridad"},
     {"id": "casco", "etiqueta": "Casco con barbuquejo mínimo 3 puntos"},
     {"id": "gafas", "etiqueta": "Gafas de seguridad"},
     {"id": "calzado", "etiqueta": "Calzado antideslizante"},
     {"id": "arrestador", "etiqueta": "Arrestador para línea de vida"},
     {"id": "red", "etiqueta": "Red de seguridad"},
     {"id": "eslinga_absorbedor", "etiqueta": "Eslinga con absorbedor de impacto"},
     {"id": "tapabocas", "etiqueta": "Tapabocas"},
     {"id": "tapaoidos", "etiqueta": "Tapaoidos"}]},
  {"id": "epp_otros", "tipo": "texto", "etiqueta": "Otros elementos de protección personal o sistemas de protección contra caídas (¿cuáles?)"},
  {"id": "sec_chequeo", "tipo": "seccion", "etiqueta": "4. Lista de chequeo"},
  {"id": "chequeo", "tipo": "tabla", "etiqueta": "Ítem",
   "columnas": [{"id": "cumple", "tipo": "lista", "etiqueta": "Cumple", "opciones": ["SI", "N/A"], "marcas": true}],
   "filas": [
     {"id": "c01", "etiqueta": "Se realizó el análisis de peligros por actividad y se cumplen los controles."},
     {"id": "c02", "etiqueta": "Los trabajadores autorizados conocen las medidas de precaución establecidas en el análisis de peligros por actividad."},
     {"id": "c03", "etiqueta": "El personal inspeccionó los equipos que conforman el sistema de protección contra caídas definido para la tarea."},
     {"id": "c04", "etiqueta": "El sistema de acceso fue inspeccionado por el coordinador de trabajo en alturas o una persona calificada y cumple con todos los aspectos de seguridad."},
     {"id": "c05", "etiqueta": "El sistema de protección contra caídas elegido permite obtener una distancia de claridad favorable para el trabajo (Requerimiento de claridad)."},
     {"id": "c06", "etiqueta": "Los equipos de protección contra caídas cuentan con la inspección anual por parte de un representante del fabricante o persona calificada."},
     {"id": "c07", "etiqueta": "Las escaleras utilizadas para trabajo seguro en alturas cuentan con las certificaciones y sistemas de protección de caídas que se ajusten a estas."},
     {"id": "c08", "etiqueta": "Cada trabajador cuenta con punto de anclaje para la labor."},
     {"id": "c09", "etiqueta": "Los puntos de anclaje a utilizar están certificados."},
     {"id": "c10", "etiqueta": "Si va a utilizar sustancias químicas, cuenta con los controles para su manipulación."},
     {"id": "c11", "etiqueta": "El personal que va a realizar la labor conoce el procedimiento de emergencia y rescate."},
     {"id": "c12", "etiqueta": "Esta presente una persona para que active el plan de emergencia en caso de ser necesario."},
     {"id": "c13", "etiqueta": "Se ha dispuesto de los elementos necesarios para izar y descender la herramienta."},
     {"id": "c14", "etiqueta": "Se han consultado otros permisos y se cumple con los requerimientos de éstos."},
     {"id": "c15", "etiqueta": "El sitio donde se ejecutará el trabajo está aislado y señalizado completamente."},
     {"id": "c16", "etiqueta": "Se verificaron las condiciones climáticas y hay ausencia de lluvia, tormenta eléctrica, fuertes vientos y/o calor o frío excesivo"},
     {"id": "c17", "etiqueta": "Las cuerdas a utilizar en los sistemas de protección contra caídas se encuentran libres de nudos."},
     {"id": "c18", "etiqueta": "¿Se garantiza que los sistemas de acceso están ubicados a distancias seguras de las líneas eléctricas?"}]},
  {"id": "sec_firmas", "tipo": "seccion", "etiqueta": "5. Firmas autorización y revalidaciones",
   "texto": "Autorizador: he verificado con el ejecutor la aplicación del programa de prevención y protección contra caídas de altura y sus anexos y considero seguro proceder con la ejecución del trabajo.\nEjecutor: he verificado con el autorizador la aplicación del programa de prevención y protección contra caídas de altura y me comprometo a comunicarlos al grupo ejecutor y considero seguro proceder con la ejecución del trabajo."},
  {"id": "observaciones", "tipo": "texto_largo", "etiqueta": "Observaciones"}
]$campos$::jsonb,
$firmas$[
  {"rol": "responsable_sst", "etiqueta": "Autorizador", "obligatoria": true},
  {"rol": "tecnico", "etiqueta": "Ejecutores", "obligatoria": true, "diaria": true,
   "columnas": [
     {"id": "aptitud_alturas", "tipo": "si_no", "esperado": true, "vigencia_de": "aptitud_alturas",
      "etiqueta": "Tiene exámen Médico Ocupacional con énfasis para trabajo en alturas de menos de un año, donde especifíca que es apto para trabajo en alturas?"},
     {"id": "ss_al_dia", "tipo": "si_no", "esperado": true, "vigencia_de": "seguridad_social",
      "etiqueta": "Tiene pago al día la seguridad Social (EPS, AFP, ARL)"},
     {"id": "condicion_restrictiva", "tipo": "si_no", "esperado": false,
      "etiqueta": "Miedo a las Alturas (Acrofobia), Sufre de Epilépsia, Mareos o Vértigo?"},
     {"id": "anclaje_verificado", "tipo": "si_no", "esperado": true,
      "etiqueta": "Se verificó el punto de anclaje del colaborador (Certificados, estructurales, autorizados)"},
     {"id": "epcc", "tipo": "si_no", "esperado": true, "vigencia_de": "epcc", "etiqueta": "EPCC"}]}
]$firmas$::jsonb,
       'publicada', 'sgsst', '{"codigo": "FOR-15", "version": "02", "fecha": "2026-06-05"}'::jsonb, now(), null
where not exists (select 1 from public.sst_plantillas where id = '00000000-0000-4000-8000-000000112a15');
