-- Usuario de demostración: puede trabajar en todo, y lo que cree se borra solo a las 5 horas.
-- Escrita y aplicada por el orquestador (2026-10-29). Idempotente.
--
-- Jhojan: "que pueda hacer todo lo que quiera, pero que todo lo que trabaje ese usuario se borre
-- a las 5 horas... necesito que lo vea una persona de confianza y no interesa si ve precios."
--
-- El rol "Usuario Prueba" YA EXISTÍA con `consultar` en los 14 módulos. Aquí sube a `trabajar`.
--
-- ------------------------------------------------------------------ lo que NO se relaja
-- `ve_datos_sensibles` se queda en false. Jhojan aceptó que vea precios y márgenes —son suyos y
-- puede decidirlo—, pero lo que esa bandera protege es otra cosa: la historia clínica de una
-- persona. Esa no es información de la empresa, es de un tercero, y él no puede consentir por
-- otro. Cuesta cero dejarlo cerrado, así que queda cerrado.
--
-- ------------------------------------------------------------------ el riesgo real, y el guardián
-- El peligro no es que el invitado MIRE: es que MODIFIQUE. Un borrado a las 5 horas quita lo que
-- el invitado creó, pero NO deshace una edición sobre un registro real. Si toca el valor del
-- contrato de Tintalá, el borrado no lo arregla: lo deja dañado y en silencio.
--
-- Por eso el guardián de abajo: un usuario demo puede CREAR lo que quiera, pero solo puede
-- cambiar o borrar lo que él mismo creó. Para el invitado es invisible —va a estar armando su
-- propia cotización, su propia visita— y los 7 registros reales de la empresa quedan intactos.
-- Si algún día estorba en una demostración, se quita el trigger de esa tabla y ya.
--
-- ------------------------------------------------------------------ cómo se borra
-- No se agregó ninguna columna a 126 tablas. El ERP ya registra la autoría en todas partes, así
-- que el borrado busca las filas cuyo AUTOR sea un usuario demo.
--
-- OJO, LA DECISIÓN MÁS IMPORTANTE DE ESTE ARCHIVO: solo se miran columnas de CREACIÓN
-- (creado_por, subido_por, registrado_por, actor…). NUNCA columnas de acción posterior
-- (aprobado_por, revisado_por, cerrado_por, anulado_por, calificado_por, archivado_por…).
-- Si el invitado aprueba una cotización REAL de Jhojan y borráramos por `aprobado_por`,
-- borraríamos esa cotización real. Esa confusión sería catastrófica y silenciosa.
--
-- El borrado corre como postgres (lo agenda pg_cron), así que los triggers de "esto no se borra,
-- se archiva" lo dejan pasar — que es justo lo que queremos solo para este caso.
--
-- Verificación: supabase/verificaciones/20261130000116_verificar.sql

-- ============================================================ 1) el rol pasa a trabajar
update public.permisos_rol pr
   set nivel = 'trabajar', ve_datos_sensibles = false
  from public.roles r
 where r.id = pr.rol_id and r.nombre = 'Usuario Prueba';

-- Por si algún módulo nuevo no estaba en el rol.
insert into public.permisos_rol (rol_id, modulo_id, nivel, ve_datos_sensibles)
select r.id, m.id, 'trabajar', false
from public.roles r cross join public.modulos m
where r.nombre = 'Usuario Prueba'
on conflict (rol_id, modulo_id) do nothing;

-- ============================================================ 2) quién es demo
create or replace function public.fn_es_demo(p_perfil uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from perfiles p join roles r on r.id = p.rol_id
                 where p.id = p_perfil and r.nombre = 'Usuario Prueba');
$$;
revoke all on function public.fn_es_demo(uuid) from public, anon;
grant execute on function public.fn_es_demo(uuid) to authenticated, service_role;

-- ============================================================ 3) el guardián
-- Un demo no cambia ni borra lo que no creó. Se aplica solo a las tablas con registros reales
-- difíciles de rehacer; no a las 126.
create or replace function public.fn_demo_no_toca_lo_ajeno()
returns trigger language plpgsql set search_path = public as $$
declare v_autor uuid;
begin
  if current_user in ('postgres', 'supabase_admin') then
    return coalesce(new, old);
  end if;
  if not fn_es_demo() then
    return coalesce(new, old);
  end if;
  -- El autor, con el nombre que use esta tabla. Por to_jsonb para no depender del tipo de fila.
  v_autor := nullif(to_jsonb(old) ->> tg_argv[0], '')::uuid;
  if v_autor is null or v_autor <> auth.uid() then
    raise exception 'El usuario de demostración solo puede cambiar lo que él mismo creó. Este registro es de la empresa.';
  end if;
  return coalesce(new, old);
end;
$$;
revoke all on function public.fn_demo_no_toca_lo_ajeno() from public, anon, authenticated;

do $$
declare
  t text; col text; pares text[][] := array[
    ['clientes','creado_por'], ['cotizaciones','creado_por'], ['proyectos','creado_por'],
    ['visitas','creado_por'], ['empleados','creado_por'], ['items_catalogo','creado_por'],
    ['sst_formatos','creado_por'], ['sst_plantillas','creada_por'], ['sst_plan_items','creado_por']
  ];
  i int;
begin
  for i in 1 .. array_length(pares, 1) loop
    t := pares[i][1]; col := pares[i][2];
    if exists (select 1 from information_schema.columns
               where table_schema='public' and table_name=t and column_name=col) then
      execute format('drop trigger if exists trg_demo_guardian on public.%I', t);
      execute format(
        'create trigger trg_demo_guardian before update or delete on public.%I
         for each row execute function public.fn_demo_no_toca_lo_ajeno(%L)', t, col);
    end if;
  end loop;
end $$;

-- ============================================================ 4) el borrado
create or replace function public.fn_purgar_demo(p_horas int default 5)
returns table (tabla text, columna text, borradas bigint)
language plpgsql security definer set search_path = public as $$
declare
  -- SOLO columnas de creación. Ver la nota de arriba: meter aquí una columna de acción
  -- (aprobado_por, revisado_por…) borraría registros reales de la empresa.
  creacion text[] := array[
    'creado_por','creada_por','subido_por','subida_por','registrado_por','registrada_por',
    'reportado_por','agregado_por','agregada_por','pactada_por','inspeccionado_por','actor',
    'leido_por','solicitado_por','sugerida_por','emitido_por','importado_por'];
  -- Columna de fecha de la fila, para respetar las horas. Se usa la primera que exista.
  fechas text[] := array[
    'creado_en','creada_en','created_at','subido_en','subida_en','registrado_en','reportado_en',
    'agregada_en','agregado_en','pactada_en','leido_en','recibida_en','firmada_en','creado'];
  r record; v_fecha text; v_sql text; v_n bigint; v_pase int;
  v_demos uuid[];
begin
  select coalesce(array_agg(p.id), '{}') into v_demos
  from perfiles p join roles r2 on r2.id = p.rol_id where r2.nombre = 'Usuario Prueba';
  if array_length(v_demos, 1) is null then return; end if;

  -- Varias pasadas: las llaves foráneas obligan a borrar en orden y no lo conocemos de antemano.
  -- Lo que falla por dependencia en una pasada, sale en la siguiente.
  for v_pase in 1 .. 8 loop
    for r in
      select c.table_name as t, c.column_name as col
      from information_schema.columns c
      join information_schema.tables ta
        on ta.table_schema = c.table_schema and ta.table_name = c.table_name and ta.table_type = 'BASE TABLE'
      where c.table_schema = 'public' and c.data_type = 'uuid' and c.column_name = any (creacion)
      order by c.table_name
    loop
      select f into v_fecha from unnest(fechas) f
       where exists (select 1 from information_schema.columns c2
                     where c2.table_schema='public' and c2.table_name=r.t and c2.column_name=f
                       and c2.data_type like 'timestamp%')
       limit 1;

      v_sql := format('delete from public.%I where %I = any ($1)', r.t, r.col);
      if v_fecha is not null then
        v_sql := v_sql || format(' and %I < now() - ($2 || '' hours'')::interval', v_fecha);
      end if;

      begin
        execute v_sql using v_demos, p_horas::text;
        get diagnostics v_n = row_count;
        if v_n > 0 then
          tabla := r.t; columna := r.col; borradas := v_n; return next;
        end if;
      exception when others then
        null;  -- dependencia pendiente: se reintenta en la pasada siguiente
      end;
    end loop;
  end loop;

  -- Archivos subidos por un demo.
  begin
    set local storage.allow_delete_query = 'true';
    delete from storage.objects o where o.owner = any (v_demos)
      and o.created_at < now() - (p_horas || ' hours')::interval;
    get diagnostics v_n = row_count;
    if v_n > 0 then tabla := 'storage.objects'; columna := 'owner'; borradas := v_n; return next; end if;
  exception when others then null;
  end;
end;
$$;
revoke all on function public.fn_purgar_demo(int) from public, anon, authenticated;

-- ============================================================ 5) cada hora
-- Sin Edge Function y sin clave en Vault: es SQL puro, lo corre pg_cron como postgres.
select cron.schedule('purgar-demo', '7 * * * *', $job$ select public.fn_purgar_demo(5); $job$);
