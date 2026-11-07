-- Verificación de la migración 143 CONTRA PRODUCCIÓN, y se revierte sola.
--
-- Correr DESPUÉS de aplicar la 143 (scripts/licitaciones/aplicar.mjs verificar, o el editor SQL
-- como postgres). Todo va en un solo bloque que TERMINA SIEMPRE EN ERROR a propósito: el error trae
-- el informe y Postgres deshace todo lo que el bloque hizo (filas de prueba, avisos, barrido). No
-- hay ROLLBACK que olvidar.
--
-- Cómo leerlo: el mensaje de error dice «INFORME 143» y una línea por prueba, OK o FALLA.
-- «rebotó» = la base lo rechazó, que es lo que se quería. Un INSERT que no hace nada NO cuenta
-- como prueba que pasó: cada prueba compara contra un valor esperado.
--
-- RLS: se fuerza el rol 'authenticated' con el sub de un perfil, y se verifica auth.uid() como
-- valor de control antes de creer el conteo (perfiles de prueba contaminados ya engañaron antes).

do $$
declare
  inf text := E'INFORME 143\n';
  v_cat text; v_codigo text; v_barrido uuid; v_res jsonb; v_lic uuid; v_doc uuid; v_n int; v_m int;
  v_pn_antes jsonb; v_pn_despues jsonb; v_admin uuid; v_sin uuid; v_uid uuid; v_txt text;
  futuro text := to_char((now() at time zone 'America/Bogota') + interval '20 days', 'YYYY-MM-DD"T"17:00:00.000');
  hoy text := to_char((now() at time zone 'America/Bogota') - interval '2 days', 'YYYY-MM-DD"T"00:00:00.000');
  v_control uuid; v_linea text; v_codigo_elec text; v_txt2 text;
begin
  -- control: la fila de la Policía, columnas de Jhojan incluidas, antes de todo
  select to_jsonb(l) - 'dias_publicado_al_traer' into v_pn_antes from licitaciones l where id_del_proceso = 'PN-ESPOL-MIC-020-2026';
  inf := inf || case when v_pn_antes is not null then 'OK    ' else 'FALLA ' end || 'la fila PN-ESPOL-MIC-020-2026 existe' || E'\n';
  inf := inf || case when (v_pn_antes ->> 'requiere_rup')::boolean is false then 'OK    ' else 'FALLA ' end
         || 'PN-ESPOL marcada mínima cuantía: requiere_rup = false' || E'\n';

  -- los criterios como quedaron
  select string_agg(x, ' | ' order by x) into v_txt from (
    select tipo || coalesce('/' || linea, '') || case when activo then '' else ' (inactivos)' end || '=' || count(*) x
    from licitacion_criterios group by tipo, linea, activo) c;
  inf := inf || 'info  criterios: ' || coalesce(v_txt, '-') || E'\n';
  select count(*) into v_n from licitacion_criterios where activo and linea = 'electrico';
  select count(*) into v_m from licitacion_criterios where not activo and linea = 'electrico' and nota like '%Desactivado el 2026-11-07%';
  inf := inf || case when v_n = 0 and v_m = 9 then 'OK    ' else 'FALLA ' end
         || 'eléctrico: 0 activos, 9 desactivados con nota y fecha (activos ' || v_n || ', con nota ' || v_m || E')\n';
  select count(*) into v_n from licitacion_criterios where activo and tipo in ('departamento', 'ciudad') and linea is null;
  select count(*) into v_m from licitacion_criterios where tipo in ('departamento', 'ciudad') and linea is not null;
  inf := inf || case when v_n = 10 and v_m = 0 then 'OK    ' else 'FALLA ' end
         || 'ubicaciones globales: 3 departamentos + 7 ciudades, ninguna con línea (' || v_n || ', con línea ' || v_m || E')\n';
  select count(*) into v_n from licitacion_criterios where activo and tipo = 'palabra' and nota like 'Confirmada por Jhojan el 2026-11-07%';
  inf := inf || case when v_n = 21 then 'OK    ' else 'FALLA ' end || 'palabras nuevas activas: ' || v_n || ' de 21' || E'\n';

  -- un código real de seguridad_electronica con los dos últimos dígitos cambiados: tiene que calzar
  -- por clase (6). Y uno de la línea eléctrica (ya inactiva): no debe dar actividad.
  select regexp_replace(valor, '\D', '', 'g'), linea into v_cat, v_linea from licitacion_criterios
   where activo and tipo = 'categoria' and linea = 'seguridad_electronica' and length(regexp_replace(valor, '\D', '', 'g')) = 8 limit 1;
  v_codigo := 'V1.' || left(v_cat, 6) || case when right(v_cat, 2) = '99' then '01' else '99' end;
  select 'V1.' || left(regexp_replace(valor, '\D', '', 'g'), 6) || '99' into v_codigo_elec from licitacion_criterios
   where tipo = 'categoria' and linea = 'electrico' and valor = '39121000';   -- UPS
  inf := inf || 'info  código de prueba ' || coalesce(v_codigo, 'NINGUNO') || ' (cargado ' || coalesce(v_cat, '-')
         || '); UPS: ' || coalesce(v_codigo_elec, 'NINGUNO') || E'\n';

  v_barrido := fn_licitaciones_barrido_abrir(now() - interval '5 days', false);
  v_res := fn_licitaciones_ingerir(v_barrido, jsonb_build_array(
    jsonb_build_object('id_del_proceso', 'PRUEBA-143-MC', 'codigo_principal_de_categoria', v_codigo,
      'nombre_del_procedimiento', 'Prueba 143 MC', 'descripci_n_del_procedimiento', 'Proceso de prueba 143 (se revierte)',
      'entidad', 'ENTIDAD DE PRUEBA 143', 'modalidad_de_contratacion', 'Mínima cuantía', 'tipo_de_contrato', 'Suministros',
      'precio_base', '20000000', 'departamento_entidad', 'Distrito Capital de Bogotá', 'ciudad_entidad', 'Bogotá',
      'urlproceso', jsonb_build_object('url', 'https://community.secop.gov.co/prueba-143'),
      'fecha_de_publicacion_del', hoy, 'fecha_de_recepcion_de', futuro),
    jsonb_build_object('id_del_proceso', 'PRUEBA-143-801116', 'codigo_principal_de_categoria', 'V1.80111600',
      'descripci_n_del_procedimiento', 'prestación de servicios', 'modalidad_de_contratacion', 'Mínima cuantía',
      'departamento_entidad', 'Distrito Capital de Bogotá', 'fecha_de_publicacion_del', hoy, 'fecha_de_recepcion_de', futuro),
    jsonb_build_object('id_del_proceso', 'PRUEBA-143-SA', 'codigo_principal_de_categoria', v_codigo,
      'descripci_n_del_procedimiento', 'Proceso de prueba 143 SA', 'modalidad_de_contratacion', 'Selección abreviada subasta inversa',
      'tipo_de_contrato', 'Obra', 'precio_base', '20000000', 'departamento_entidad', 'Distrito Capital de Bogotá',
      'fecha_de_publicacion_del', hoy, 'fecha_de_recepcion_de', futuro),
    -- ubicación obligatoria: Pasto, régimen especial, actividad nuestra → entra (se ve) pero NO es relevante
    jsonb_build_object('id_del_proceso', 'PRUEBA-143-PASTO', 'codigo_principal_de_categoria', v_codigo,
      'descripci_n_del_procedimiento', 'Prueba 143 en Pasto', 'modalidad_de_contratacion', 'Contratación régimen especial',
      'tipo_de_contrato', 'Obra', 'ciudad_entidad', 'Pasto', 'departamento_entidad', 'Nariño',
      'fecha_de_publicacion_del', hoy, 'fecha_de_recepcion_de', futuro),
    -- eléctrico fuera: UPS en Bogotá no entra
    jsonb_build_object('id_del_proceso', 'PRUEBA-143-UPS', 'codigo_principal_de_categoria', v_codigo_elec,
      'descripci_n_del_procedimiento', 'Prueba 143 UPS', 'modalidad_de_contratacion', 'Mínima cuantía',
      'departamento_entidad', 'Distrito Capital de Bogotá', 'fecha_de_publicacion_del', hoy, 'fecha_de_recepcion_de', futuro),
    -- palabra + ciudad sin definir en SECOP: Medellín por el nombre de la entidad, cercas por CONCERTINAS
    jsonb_build_object('id_del_proceso', 'PRUEBA-143-MED', 'codigo_principal_de_categoria', 'UNSPECIFIED',
      'descripci_n_del_procedimiento', 'Suministro e instalación de CONCERTINAS', 'modalidad_de_contratacion', 'Mínima cuantía',
      'entidad', 'ALCALDIA DE MEDELLIN PRUEBA 143', 'ciudad_entidad', 'No Definido', 'departamento_entidad', 'Antioquia',
      'fecha_de_publicacion_del', hoy, 'fecha_de_recepcion_de', futuro)));
  inf := inf || 'info  ingerir → ' || v_res::text || E'\n';

  select string_agg(id_del_proceso, ',' order by id_del_proceso) into v_txt from licitaciones where id_del_proceso like 'PRUEBA-143-%';
  inf := inf || case when v_txt = 'PRUEBA-143-MC,PRUEBA-143-MED,PRUEBA-143-PASTO,PRUEBA-143-SA' then 'OK    ' else 'FALLA ' end
         || 'entran 4 de 6 (801116 nunca; UPS ya no): ' || coalesce(v_txt, 'ninguna') || E'\n';
  select string_agg(id_del_proceso || '=' || public.fn_licitacion_es_relevante(criterios_que_coinciden, afinidad), ',' order by id_del_proceso)
    into v_txt from licitaciones where id_del_proceso like 'PRUEBA-143-%';
  inf := inf || case when v_txt = 'PRUEBA-143-MC=true,PRUEBA-143-MED=true,PRUEBA-143-PASTO=false,PRUEBA-143-SA=true' then 'OK    ' else 'FALLA ' end
         || 'relevantes: Bogotá MC y SA, Medellín sí; Pasto no (sin ubicación): ' || coalesce(v_txt, '-') || E'\n';
  select afinidad || ' ' || array_to_string(criterios_que_coinciden, ',') into v_txt from licitaciones where id_del_proceso = 'PRUEBA-143-PASTO';
  inf := inf || case when v_txt = '4 actividad,modalidad,tipo_contrato,presupuesto' then 'OK    ' else 'FALLA ' end
         || 'Pasto: 4 de 5 y aun así no relevante: ' || coalesce(v_txt, '-') || E'\n';
  select array_to_string(lineas_que_calzaron, ',') into v_txt from licitaciones where id_del_proceso = 'PRUEBA-143-MED';
  inf := inf || case when v_txt = 'cercas' then 'OK    ' else 'FALLA ' end || 'Medellín (ciudad «No Definido», por la entidad) entra por cercas: ' || coalesce(v_txt, '-') || E'\n';
  select count(*) into v_n from licitaciones where id_del_proceso = 'PRUEBA-143-MC' and actividad_por = 'unspsc' and requiere_rup is false
     and dias_publicado_al_traer = 2 and lineas_que_calzaron = array['seguridad_electronica'];
  inf := inf || case when v_n = 1 then 'OK    ' else 'FALLA ' end || 'MC: por clase de 6, seguridad_electronica, requiere_rup=false, 2 días tarde' || E'\n';
  select entidad || ' | ' || nombre || ' | ' || ciudad || ' | ' || modalidad || ' | ' || precio_base || ' | ' || url || ' | ' || estado || ' | ' || fecha_cierre_secop
    into v_txt from licitaciones where id_del_proceso = 'PRUEBA-143-MC';
  inf := inf || case when v_txt like 'ENTIDAD DE PRUEBA 143 | Prueba 143 MC | Bogotá | Mínima cuantía | 20000000% | https://community.secop.gov.co/prueba-143 | detectada | %'
                     then 'OK    ' else 'FALLA ' end || 'columnas de Jhojan llenas desde SECOP: ' || coalesce(v_txt, 'null') || E'\n';
  select entidad || ' | ' || nombre into v_txt from licitaciones where id_del_proceso = 'PRUEBA-143-SA';
  inf := inf || case when v_txt = '(SECOP no trae la entidad) | Proceso de prueba 143 SA' then 'OK    ' else 'FALLA ' end
         || 'sin entidad ni nombre en SECOP no rebota: ' || coalesce(v_txt, 'null') || E'\n';
  select count(*) into v_n from licitaciones where id_del_proceso = 'PRUEBA-143-SA' and requiere_rup is true;
  inf := inf || case when v_n = 1 then 'OK    ' else 'FALLA ' end || 'SA: requiere_rup=true' || E'\n';
  begin
    insert into licitacion_criterios (tipo, nombre, valor, linea, creado_por, activo)
    values ('ciudad', 'Pereira', 'Pereira', 'redes', (select creado_por from licitacion_criterios limit 1), false);
    inf := inf || E'FALLA ubicación con línea: la aceptó\n';
  exception when check_violation then inf := inf || E'OK    ubicación con línea (las ubicaciones son globales): rebotó\n'; end;

  -- avisos: uno por persona con el módulo, de MC y de Medellín; ni SA (RUP) ni Pasto (fuera de zona)
  select id into v_lic from licitaciones where id_del_proceso = 'PRUEBA-143-MC';
  select count(*) into v_n from notificaciones where tipo = 'licitacion_sin_rup' and origen_id = v_lic;
  -- fn_notificar no le avisa a un usuario de demostración (fn_es_demo): no se cuenta.
  select count(*) into v_m from fn_notif_con_permiso('licitaciones', 'consultar') d
   where coalesce((select activa from notificacion_preferencias where perfil_id = d and tipo = 'licitacion_sin_rup'), true)
     and not fn_es_demo(d);
  inf := inf || case when v_n = v_m and v_m > 0 then 'OK    ' when v_m = 0 then 'FALLA ' else 'REVISAR ' end
         || 'avisos de la MC = personas con el módulo (sin demo): ' || v_n || ' de ' || v_m
         || case when v_m = 0 then ' (nadie tiene el módulo: el aviso no le llega a nadie)' else '' end || E'\n';
  select string_agg(distinct l.id_del_proceso, ',' order by l.id_del_proceso) into v_txt
    from notificaciones n join licitaciones l on l.id = n.origen_id where l.id_del_proceso like 'PRUEBA-143-%';
  inf := inf || case when v_txt = 'PRUEBA-143-MC,PRUEBA-143-MED' then 'OK    ' else 'FALLA ' end
         || 'avisan MC y Medellín; ni la SA ni Pasto: ' || coalesce(v_txt, 'ninguna') || E'\n';
  -- reingerir no duplica ni re-avisa
  perform fn_licitaciones_ingerir(v_barrido, jsonb_build_array(jsonb_build_object('id_del_proceso', 'PRUEBA-143-MC',
      'codigo_principal_de_categoria', v_codigo, 'entidad', 'ENTIDAD DE PRUEBA 143', 'modalidad_de_contratacion', 'Mínima cuantía',
      'tipo_de_contrato', 'Suministros', 'precio_base', '20000000', 'departamento_entidad', 'Distrito Capital de Bogotá',
      'fecha_de_publicacion_del', hoy, 'fecha_de_recepcion_de', futuro)));
  select count(*) into v_n from notificaciones where tipo = 'licitacion_sin_rup' and origen_id = v_lic;
  inf := inf || case when v_n = v_m then 'OK    ' else 'FALLA ' end || 'reingerir no re-avisa: ' || v_n || E'\n';
  perform fn_licitaciones_barrido_cerrar(v_barrido, null);
  select count(*) into v_n from licitacion_barridos where id = v_barrido and terminado_en is not null and error is null and leidos = 7;
  inf := inf || case when v_n = 1 then 'OK    ' else 'FALLA ' end || 'barrido registrado y cerrado (7 leídas)' || E'\n';

  -- palabras: tildes, mayúsculas y plurales (lo que se le prometió a Jhojan), y el ruido que no debe entrar
  select string_agg(w || ' / ' || t, '; ') into v_txt
  from (values ('CONCERTINA', 'Suministro de CONCERTINAS'), ('SUBESTACION', 'mantenimiento de la subestación'),
               ('SUBESTACION', 'mantenimiento de subestaciones'), ('CAMARAS', 'Cámaras IP'),
               ('CAMARA DE VIDEO', 'cámaras de video'), ('RED DE DATOS', 'redes de datos'),
               ('CENTRAL TELEFONICA', 'centrales telefónicas'), ('CERCA ELECTRICA', 'cercas eléctricas')) x(w, t)
  where not fn_licitacion_palabra_calza(t, w);
  inf := inf || case when v_txt is null then 'OK    ' else 'FALLA ' end || 'plurales y tildes calzan (8 casos de la regla)'
         || coalesce(': no calzaron ' || v_txt, '') || E'\n';
  select r.actividad_por, array_to_string(r.lineas, ',') into v_txt, v_txt2 from fn_licitacion_relevancia(jsonb_build_object(
      'codigo_principal_de_categoria', 'UNSPECIFIED', 'departamento_entidad', 'Distrito Capital de Bogotá',
      'descripci_n_del_procedimiento', 'Prestación de servicios profesionales. Anexar certificado de Cámara de Comercio. Telefonía móvil')) r;
  inf := inf || case when v_txt is null then 'OK    ' else 'FALLA ' end
         || '«Cámara de Comercio» / «telefonía móvil» no dan actividad con TODAS las palabras cargadas'
         || coalesce(' (calzó por ' || nullif(v_txt2, '') || ')', '') || E'\n';
  select r.actividad_por, array_to_string(r.lineas, ',') into v_txt, v_txt2 from fn_licitacion_relevancia(jsonb_build_object(
      'codigo_principal_de_categoria', 'UNSPECIFIED', 'departamento_entidad', 'Distrito Capital de Bogotá',
      'descripci_n_del_procedimiento', 'Suministro de combustible ACPM para la planta eléctrica; mantenimiento de subestación y tableros eléctricos')) r;
  inf := inf || case when v_txt is null then 'OK    ' else 'FALLA ' end
         || 'planta eléctrica / subestación / tableros ya no dan actividad'
         || coalesce(' (calzó por ' || nullif(v_txt2, '') || ')', '') || E'\n';
  select string_agg(linea || '=' || n, ' ' order by linea) into v_txt
    from (select linea, count(*) n from licitacion_criterios where activo and tipo = 'palabra' group by linea) x;
  inf := inf || 'info  palabras activas por línea: ' || coalesce(v_txt, '-') || E'\n';

  -- requisitos: lo que tiene que rebotar
  insert into licitacion_documentos (licitacion_id, tipo, nombre_original) values (v_lic, 'invitacion', 'invitacion-prueba.pdf') returning id into v_doc;
  begin
    insert into licitacion_requisitos (licitacion_id, documento_id, tema, requisito, estado, acreditado) values (v_lic, v_doc, 'juridico', 'RUP', 'cumple', 'x');
    inf := inf || E'FALLA habilitante sin página: lo aceptó\n';
  exception when check_violation then inf := inf || E'OK    habilitante sin página/cita: rebotó\n'; end;
  begin
    insert into licitacion_requisitos (licitacion_id, documento_id, tema, requisito, estado, pagina, cita) values (v_lic, v_doc, 'experiencia', 'Exp', 'no_exigido', 3, 'x');
    inf := inf || E'FALLA no_exigido sin razón: lo aceptó\n';
  exception when check_violation then inf := inf || E'OK    no_exigido sin razón: rebotó\n'; end;
  insert into licitacion_requisitos (licitacion_id, documento_id, tema, requisito, estado, pagina, cita, exigido_valor, comparacion, acreditado_valor)
  values (v_lic, v_doc, 'capacidad_financiera', 'Liquidez', 'cumple', 4, 'Liquidez ≥ 1,20', 1.2, 'minimo', 1.1995),
         (v_lic, v_doc, 'capacidad_financiera', 'Endeudamiento', 'cumple', 4, 'Endeudamiento ≤ 0,70', 0.70, 'maximo', null);
  select string_agg(requisito || '=' || estado, ', ' order by requisito) into v_txt from licitacion_requisitos where licitacion_id = v_lic;
  inf := inf || case when v_txt = 'Endeudamiento=falta_el_dato, Liquidez=cumple' then 'OK    ' else 'FALLA ' end || 'reglas con cifra (tolerancia 0,001; sin dato = falta): ' || v_txt || E'\n';
  select resultado || ' / ' || motivo into v_txt from v_licitacion_resultado where licitacion_id = v_lic;
  inf := inf || case when v_txt like 'no_cumple%' then 'OK    ' else 'FALLA ' end || 'resultado calculado: ' || coalesce(v_txt, 'null') || E'\n';

  -- RLS con rol forzado y valor de control
  select p.id into v_admin from perfiles p join permisos_rol pr on pr.rol_id = p.rol_id and pr.modulo_id = 'licitaciones'
   where pr.nivel = 'responsable' limit 1;
  select p.id into v_sin from perfiles p where not exists (select 1 from permisos_rol pr where pr.rol_id = p.rol_id and pr.modulo_id = 'licitaciones') limit 1;
  if v_admin is null then inf := inf || E'FALLA no hay perfil responsable de licitaciones para probar RLS\n'; end if;
  if v_sin is null then inf := inf || E'info  todos los perfiles tienen el módulo: no se prueba el «no ve»\n'; end if;
  foreach v_uid in array array[v_admin, v_sin] loop
    continue when v_uid is null;
    perform set_config('request.jwt.claims', jsonb_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    set local role authenticated;
    select count(*) into v_n from licitacion_requisitos where licitacion_id = v_lic;
    select auth.uid() into v_control;
    select current_user into v_txt;
    reset role;
    inf := inf || case
        when v_control is distinct from v_uid or v_txt <> 'authenticated' then 'FALLA control: rol ' || v_txt || ', uid ' || coalesce(v_control::text, 'null') || ' (no se puede concluir)'
        when v_uid = v_admin and v_n = 2 then 'OK    RLS responsable ve los 2 requisitos'
        when v_uid = v_sin and v_n = 0 then 'OK    RLS sin el módulo ve 0'
        else 'FALLA RLS ' || case when v_uid = v_admin then 'responsable' else 'sin módulo' end || ' ve ' || v_n end || E'\n';
  end loop;

  -- la fila de la Policía quedó igual (salvo el relleno de días)
  select to_jsonb(l) - 'dias_publicado_al_traer' into v_pn_despues from licitaciones l where id_del_proceso = 'PN-ESPOL-MIC-020-2026';
  inf := inf || case when v_pn_despues = v_pn_antes then 'OK    ' else 'FALLA ' end || 'PN-ESPOL intacta' || E'\n';

  raise exception '%', inf || E'\n(Fin: este error es a propósito; todo lo de la prueba se deshizo.)';
end $$;
