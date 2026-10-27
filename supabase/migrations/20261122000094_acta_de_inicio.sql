-- Acta de inicio de obra (2026-10-27): plantilla del ámbito Proyectos sobre el motor de la 85, con
-- el alcance que sale del contrato confirmado (93) y el reloj del plazo calculado en días hábiles.
--
-- Estructura: la del acta que Jhojan usa hoy (ACTA_DE_INICIO_DE_OBRA_SEI.doc, La Isla, marzo
-- 2026): reunión (ciudad, contratante, contratista), lugar, referencia, actividades (el alcance),
-- observaciones del cliente y del técnico, firmas. Más lo que le falta y es lo importante:
--
--   REQUISITOS PREVIOS. El acta arranca el reloj: desde su firma corren los días hábiles del
--   contrato y la multa por día de retraso. El contrato de Tintalá exige, ANTES del acta, pólizas
--   aprobadas, anticipo girado, cronograma pactado y supervisor designado por escrito. Van como
--   casillas con su dato. Si se va a firmar con alguno sin marcar, la pantalla AVISA pero no
--   bloquea (si bloquea, se firma en papel y el ERP deja de enterarse): campo "aviso_firma".
--
--   FECHAS CALCULADAS, no escritas a mano: fecha_inicio_oficial = la fecha del acta;
--   fecha_terminacion_estimada = el plazo en DÍAS HÁBILES (lunes a viernes, sin festivos de
--   Colombia), contados desde el día siguiente al acta. Las calcula la base en cada guardado
--   mientras el acta está en borrador (trigger), y el celular las muestra con el mismo cálculo.
--   Quedan dentro del contenido sellado. SUPUESTOS A CONFIRMAR CON JHOJAN: que el sábado no es
--   hábil y que el día del acta no cuenta. Están en fn_sumar_dias_habiles, en un solo lugar.
--
--   ALCANCE DESDE EL CONTRATO. Se prellena con el alcance CONFIRMADO del contrato vigente (93),
--   nunca releyendo el PDF. Es editable, pero el acta guarda lo que dijo el contrato
--   (respuestas._prellenado) y queda MARCADA si se apartó: en pantalla, en el PDF y en
--   fn_formato_se_aparta(). El ejemplo de Jhojan tenía dos ítems pegados a mano en una sola frase
--   ("…accesos a o Regata en terreno duro…"): eso deja de pasar.
--
-- El prellenado viaja al celular con señal (fn_actas_prellenado: un registro por obra, solo lo
-- necesario: nada de valores comerciales), porque el acta se llena sin señal en la obra.
--
-- Datos del contratista (Jhojan como representante legal): columnas nuevas en
-- configuracion_empresa, VACÍAS. Se llenan una vez desde el SQL editor o Configuración; mientras
-- estén vacías, esos campos llegan en blanco al acta.
--
-- Requiere la 85 (motor por ámbito) y la 93 (contrato). Idempotente.
-- Verificación: supabase/verificaciones/20261122000094_verificar.sql
-- Rollback:     supabase/rollbacks/20261122000094_acta_de_inicio_down.sql

-- ============================================================ 1) festivos de Colombia
create table if not exists public.festivos_colombia (
  fecha date primary key,
  nombre text not null
);
alter table public.festivos_colombia enable row level security;
revoke all on table public.festivos_colombia from anon;
revoke insert, update, delete, truncate, trigger, references on table public.festivos_colombia from authenticated;
drop policy if exists festivos_colombia_select on public.festivos_colombia;
create policy festivos_colombia_select on public.festivos_colombia for select to authenticated using (true);

-- Festivos de un año: fijos, Ley Emiliani (se corren al lunes) y los que dependen de la Pascua.
create or replace function public.fn_festivos_de(p_anio int)
returns table (fecha date, nombre text)
language plpgsql
immutable
set search_path = public
as $$
declare
  a int := p_anio % 19; b int := p_anio / 100; c int := p_anio % 100;
  d int; e int; f int; g int; h int; i int; k int; l int; m int;
  pascua date;
begin
  d := b / 4; e := b % 4; f := (b + 8) / 25; g := (b - f + 1) / 3;
  h := (19 * a + b - d - g + 15) % 30; i := c / 4; k := c % 4;
  l := (32 + 2 * e + 2 * i - h - k) % 7; m := (a + 11 * h + 22 * l) / 451;
  pascua := make_date(p_anio, (h + l - 7 * m + 114) / 31, ((h + l - 7 * m + 114) % 31) + 1);
  return query
  select x.f, x.n from (values
    (make_date(p_anio, 1, 1), 'Año Nuevo'),
    (make_date(p_anio, 5, 1), 'Día del Trabajo'),
    (make_date(p_anio, 7, 20), 'Día de la Independencia'),
    (make_date(p_anio, 8, 7), 'Batalla de Boyacá'),
    (make_date(p_anio, 12, 8), 'Inmaculada Concepción'),
    (make_date(p_anio, 12, 25), 'Navidad'),
    (pascua - 3, 'Jueves Santo'),
    (pascua - 2, 'Viernes Santo'),
    (pascua + 43, 'Ascensión del Señor'),
    (pascua + 64, 'Corpus Christi'),
    (pascua + 71, 'Sagrado Corazón')
  ) x(f, n)
  union all
  select y.f + ((8 - extract(isodow from y.f)::int) % 7), y.n from (values
    (make_date(p_anio, 1, 6), 'Reyes Magos'),
    (make_date(p_anio, 3, 19), 'San José'),
    (make_date(p_anio, 6, 29), 'San Pedro y San Pablo'),
    (make_date(p_anio, 8, 15), 'Asunción de la Virgen'),
    (make_date(p_anio, 10, 12), 'Día de la Raza'),
    (make_date(p_anio, 11, 1), 'Todos los Santos'),
    (make_date(p_anio, 11, 11), 'Independencia de Cartagena')
  ) y(f, n);
end;
$$;

insert into public.festivos_colombia (fecha, nombre)
select fecha, nombre from generate_series(2025, 2040) anio, lateral public.fn_festivos_de(anio)
on conflict (fecha) do nothing;

-- El plazo en días hábiles: lunes a viernes, sin festivos, contando desde el día SIGUIENTE a
-- p_desde. (Si Jhojan dice que el sábado es hábil o que el día del acta cuenta, se cambia aquí y
-- en src/lib/fechas/dias-habiles.ts, que hace lo mismo en el celular.)
create or replace function public.fn_sumar_dias_habiles(p_desde date, p_dias int)
returns date
language plpgsql
stable
set search_path = public
as $$
declare
  d date := p_desde;
  n int := 0;
begin
  if p_desde is null or p_dias is null or p_dias < 1 then
    return null;
  end if;
  while n < p_dias loop
    d := d + 1;
    if extract(isodow from d) <= 5 and not exists (select 1 from festivos_colombia where fecha = d) then
      n := n + 1;
    end if;
  end loop;
  return d;
end;
$$;

-- ============================================================ 2) datos del contratista
alter table public.configuracion_empresa add column if not exists representante_legal_nombre text;
alter table public.configuracion_empresa add column if not exists representante_legal_cedula text;
alter table public.configuracion_empresa add column if not exists representante_legal_cedula_expedida_en text;

-- ============================================================ 3) prellenado para el celular
-- Por obra: lo del cliente, la sede, el contrato confirmado y el contratista. Solo para quien
-- llena actas (Proyectos "trabajar"). Ningún valor comercial.
create or replace function public.fn_actas_prellenado()
returns table (proyecto_id uuid, datos jsonb)
language sql
stable
security definer
set search_path = public
as $$
  select p.id,
    jsonb_strip_nulls(jsonb_build_object(
      'ciudad', coalesce(nullif(trim(s.municipio), ''), 'Bogotá'),
      'contratante_razon_social', cl.nombre,
      'contratante_nit', cl.nit,
      'contratante_nombre', nullif(trim(cl.contacto), ''),
      'contratista_nombre', e.representante_legal_nombre,
      'contratista_cedula', e.representante_legal_cedula,
      'contratista_expedida_en', e.representante_legal_cedula_expedida_en,
      'lugar_nombre', coalesce(s.nombre, cl.nombre),
      'lugar_direccion', coalesce(s.direccion, cl.direccion),
      'referencia', nullif(concat_ws(' · ',
                      case when c.numero is not null then 'Contrato ' || c.numero end,
                      case when q.codigo is not null then 'Cotización ' || q.codigo end,
                      case when c.numero is null and q.codigo is null then 'Proyecto ' || p.codigo end), ''),
      'alcance', c.alcance,
      'plazo_dias_habiles', case when c.plazo_unidad = 'dias_habiles' then c.plazo_cantidad::text end,
      '_contrato_id', c.contrato_id
    ))
  from proyectos p
  left join clientes cl on cl.id = p.cliente_id
  left join lateral (
    select s2.nombre, s2.direccion, s2.municipio from cliente_sedes s2
    where s2.cliente_id = p.cliente_id and s2.activa
    order by (s2.nombre ilike '%principal%') desc, s2.created_at
    limit 1
  ) s on true
  left join v_proyecto_contrato_vigente c on c.proyecto_id = p.id
  left join cotizaciones q on q.id = p.cotizacion_aprobada_id
  left join lateral (select * from configuracion_empresa limit 1) e on true
  where fn_tiene_permiso('proyectos', 'trabajar');
$$;

-- ============================================================ 4) fechas calculadas (trigger)
-- Campos con "calculado": la base escribe el valor; lo que mande la app se reemplaza. Solo
-- mientras el formato está en borrador y sin firmas (después el contenido está sellado).
create or replace function public.fn_sst_formato_calculos()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_campos jsonb;
  c jsonb;
  v_plazo int;
  v_valor text;
begin
  if tg_op = 'UPDATE' and (old.estado <> 'borrador' or fn_sst_formato_tiene_firmas(old.id)) then
    return new;
  end if;
  select p.campos into v_campos from sst_plantillas p where p.id = new.plantilla_id;
  if v_campos is null then
    return new;
  end if;
  for c in select x from jsonb_array_elements(v_campos) x where x ? 'calculado' loop
    v_valor := null;
    if c ->> 'calculado' = 'fecha_del_acta' then
      v_valor := new.fecha::text;
    elsif c ->> 'calculado' = 'terminacion_dias_habiles' then
      begin
        v_plazo := nullif(trim(new.respuestas ->> (c ->> 'plazo_campo')), '')::int;
      exception when others then
        v_plazo := null;
      end;
      v_valor := fn_sumar_dias_habiles(new.fecha, v_plazo)::text;
    end if;
    new.respuestas := case when v_valor is null then new.respuestas - (c ->> 'id')
                           else jsonb_set(new.respuestas, array[c ->> 'id'], to_jsonb(v_valor)) end;
  end loop;
  return new;
end;
$$;
-- "calculos" va antes que "reglas" (orden alfabético de los triggers): las reglas de la 75 ven el
-- valor ya calculado.
drop trigger if exists trg_sst_formato_calculos on public.sst_formatos;
create trigger trg_sst_formato_calculos before insert or update on public.sst_formatos
  for each row execute function public.fn_sst_formato_calculos();

-- ¿Qué campos prellenados se apartaron de lo que traían? (ej. el alcance contra el contrato)
create or replace function public.fn_formato_se_aparta(p_formato_id uuid)
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(x ->> 'etiqueta' order by x ->> 'etiqueta'), '{}')
  from sst_formatos f
  join sst_plantillas p on p.id = f.plantilla_id,
  jsonb_array_elements(p.campos) x
  where f.id = p_formato_id
    and fn_plantillas_permiso(f.ambito, 'consultar')
    and x ? 'prellenar'
    and f.respuestas -> '_prellenado' ? (x ->> 'id')
    and regexp_replace(coalesce(f.respuestas ->> (x ->> 'id'), ''), '\s+', ' ', 'g')
        is distinct from regexp_replace(coalesce(f.respuestas -> '_prellenado' ->> (x ->> 'id'), ''), '\s+', ' ', 'g');
$$;

-- ============================================================ 5) la plantilla
insert into public.sst_plantillas (id, ambito, codigo, nombre, version, descripcion, estado, publicada_en, campos, firmas)
values (
  '00000000-0000-4000-8000-0000000094a1', 'proyectos', 'PRY-ACTA-INICIO', 'Acta de inicio de obra', 1,
  'Arranca el plazo del contrato. El alcance sale del contrato confirmado; antes de firmar, revisa los requisitos previos.',
  'publicada', now(),
  '[
    {"id": "sec_reunion", "tipo": "seccion", "etiqueta": "Reunión"},
    {"id": "ciudad", "tipo": "texto", "etiqueta": "Ciudad", "obligatorio": true, "prellenar": "ciudad"},
    {"id": "contratante_razon_social", "tipo": "texto", "etiqueta": "Contratante (razón social)", "obligatorio": true, "prellenar": "contratante_razon_social"},
    {"id": "contratante_nit", "tipo": "texto", "etiqueta": "NIT del contratante", "prellenar": "contratante_nit"},
    {"id": "contratante_nombre", "tipo": "texto", "etiqueta": "Por el contratante: nombre", "obligatorio": true, "prellenar": "contratante_nombre"},
    {"id": "contratante_cedula", "tipo": "texto", "etiqueta": "Por el contratante: cédula", "obligatorio": true},
    {"id": "contratante_calidad", "tipo": "lista", "etiqueta": "En calidad de", "obligatorio": true,
     "opciones": ["Representante legal", "Administrador", "Delegado del consejo"]},
    {"id": "contratista_nombre", "tipo": "texto", "etiqueta": "Por el contratista: nombre", "obligatorio": true, "prellenar": "contratista_nombre"},
    {"id": "contratista_cedula", "tipo": "texto", "etiqueta": "Por el contratista: cédula", "obligatorio": true, "prellenar": "contratista_cedula"},
    {"id": "contratista_expedida_en", "tipo": "texto", "etiqueta": "Cédula expedida en", "prellenar": "contratista_expedida_en"},

    {"id": "sec_lugar", "tipo": "seccion", "etiqueta": "Lugar y referencia"},
    {"id": "lugar_nombre", "tipo": "texto", "etiqueta": "Lugar donde se ejecutan los trabajos", "obligatorio": true, "prellenar": "lugar_nombre"},
    {"id": "lugar_direccion", "tipo": "texto", "etiqueta": "Dirección", "obligatorio": true, "prellenar": "lugar_direccion"},
    {"id": "referencia", "tipo": "texto", "etiqueta": "Referencia (contrato y cotización)", "obligatorio": true, "prellenar": "referencia"},

    {"id": "sec_alcance", "tipo": "seccion", "etiqueta": "Donde se realizarán las siguientes actividades"},
    {"id": "alcance", "tipo": "texto_largo", "etiqueta": "Alcance", "obligatorio": true, "prellenar": "alcance",
     "ayuda": "Sale del contrato confirmado. Si lo cambias, el acta queda marcada como apartada del contrato."},

    {"id": "sec_requisitos", "tipo": "seccion", "etiqueta": "Requisitos previos",
     "ayuda": "Desde la firma de esta acta corre el plazo del contrato y la multa por día de retraso. Revisa que todo esté cumplido antes de firmar."},
    {"id": "req_polizas", "tipo": "si_no", "etiqueta": "Pólizas entregadas y aprobadas por el contratante", "aviso_firma": true},
    {"id": "req_polizas_fecha", "tipo": "fecha", "etiqueta": "Fecha de aprobación de las pólizas"},
    {"id": "req_anticipo", "tipo": "si_no", "etiqueta": "Anticipo girado", "aviso_firma": true},
    {"id": "req_anticipo_fecha", "tipo": "fecha", "etiqueta": "Fecha del giro del anticipo"},
    {"id": "req_anticipo_valor", "tipo": "numero", "etiqueta": "Valor del anticipo recibido"},
    {"id": "req_cronograma", "tipo": "si_no", "etiqueta": "Cronograma detallado pactado", "aviso_firma": true},
    {"id": "req_supervisor", "tipo": "si_no", "etiqueta": "Supervisor designado por escrito", "aviso_firma": true},
    {"id": "req_supervisor_nombre", "tipo": "texto", "etiqueta": "Nombre del supervisor"},

    {"id": "sec_plazo", "tipo": "seccion", "etiqueta": "Plazo"},
    {"id": "plazo_dias_habiles", "tipo": "numero", "etiqueta": "Plazo del contrato (días hábiles)", "obligatorio": true, "prellenar": "plazo_dias_habiles"},
    {"id": "fecha_inicio_oficial", "tipo": "fecha", "etiqueta": "Fecha de inicio oficial", "calculado": "fecha_del_acta",
     "ayuda": "Es la fecha del acta."},
    {"id": "fecha_terminacion_estimada", "tipo": "fecha", "etiqueta": "Fecha de terminación estimada", "calculado": "terminacion_dias_habiles",
     "plazo_campo": "plazo_dias_habiles",
     "ayuda": "Días hábiles: lunes a viernes, sin festivos de Colombia, contados desde el día siguiente al acta."},

    {"id": "sec_observaciones", "tipo": "seccion", "etiqueta": "Observaciones"},
    {"id": "observaciones_cliente", "tipo": "texto_largo", "etiqueta": "Observaciones del cliente"},
    {"id": "observaciones_tecnico", "tipo": "texto_largo", "etiqueta": "Observaciones del técnico"}
  ]'::jsonb,
  '[{"rol": "sst_cliente", "etiqueta": "Por el contratante", "obligatoria": true},
    {"rol": "responsable_sst", "etiqueta": "Por Servielectro (coordinador)", "obligatoria": true},
    {"rol": "tecnico", "etiqueta": "Técnicos en obra", "obligatoria": true},
    {"rol": "otro", "etiqueta": "Otro", "obligatoria": false}]'::jsonb
)
on conflict do nothing;

-- ============================================================ 6) privilegios
revoke all on function public.fn_festivos_de(int) from public, anon;
revoke all on function public.fn_sumar_dias_habiles(date, int) from public, anon;
revoke all on function public.fn_actas_prellenado() from public, anon;
revoke all on function public.fn_formato_se_aparta(uuid) from public, anon;
grant execute on function public.fn_festivos_de(int) to authenticated;
grant execute on function public.fn_sumar_dias_habiles(date, int) to authenticated, service_role;
grant execute on function public.fn_actas_prellenado() to authenticated;
grant execute on function public.fn_formato_se_aparta(uuid) to authenticated;
-- de trigger: nadie
revoke all on function public.fn_sst_formato_calculos() from public, anon, authenticated;
