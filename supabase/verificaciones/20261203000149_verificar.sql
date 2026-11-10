-- Verificación de la 149 CONTRA PRODUCCIÓN, y se revierte sola (termina SIEMPRE en error a propósito).

do $$
declare
  inf text := E'INFORME 149\n';
  v_n int; v_txt text; v_txt2 text; v_barrido uuid;
  hoy text := to_char((now() at time zone 'America/Bogota') - interval '2 days', 'YYYY-MM-DD"T"00:00:00.000');
begin
  select count(*) into v_n from licitacion_criterios where tipo = 'categoria' and valor = '72154000' and not activo and nota like '%2026-11-08%cajón de sastre%';
  inf := inf || case when v_n = 1 then 'OK    ' else 'FALLA ' end || '72154000 inactivo, con nota y fecha' || E'\n';
  select count(*) into v_n from licitacion_criterios where tipo = 'palabra' and fn_licitacion_norm(valor) = 'camaras' and not activo and nota like '%2026-11-08%Cámaras de Comercio%';
  inf := inf || case when v_n = 1 then 'OK    ' else 'FALLA ' end || 'CAMARAS inactiva, con el motivo' || E'\n';
  select count(*) into v_n from licitacion_criterios where tipo = 'palabra' and activo and fn_licitacion_norm(valor) in ('camara de seguridad', 'camaras de seguridad', 'camara de video', 'camara ip', 'alarma');
  inf := inf || case when v_n = 5 then 'OK    ' else 'FALLA ' end || 'siguen activas las 4 de cámara y ALARMA: ' || v_n || ' de 5' || E'\n';

  select r.actividad_por into v_txt from fn_licitacion_relevancia(jsonb_build_object('codigo_principal_de_categoria', 'UNSPECIFIED',
    'descripci_n_del_procedimiento', 'Congreso de la Confederación Colombiana de Cámaras de Comercio')) r;
  inf := inf || case when v_txt is null then 'OK    ' else 'FALLA ' end || '«Cámaras de Comercio» ya no da actividad' || E'\n';
  select array_to_string(r.lineas, ',') into v_txt from fn_licitacion_relevancia(jsonb_build_object('codigo_principal_de_categoria', 'UNSPECIFIED',
    'descripci_n_del_procedimiento', 'Instalación de cámaras de seguridad y cámaras IP')) r;
  inf := inf || case when v_txt = 'seguridad_electronica' then 'OK    ' else 'FALLA ' end || '«cámaras de seguridad» sigue entrando: ' || coalesce(v_txt, 'nada') || E'\n';
  select array_to_string(r.lineas, ',') into v_txt from fn_licitacion_relevancia(jsonb_build_object('codigo_principal_de_categoria', 'UNSPECIFIED',
    'descripci_n_del_procedimiento', 'Kit de alarma de emergencia y evacuación')) r;
  inf := inf || case when v_txt = 'seguridad_electronica' then 'OK    ' else 'FALLA ' end || 'ALARMA sigue entrando: ' || coalesce(v_txt, 'nada') || E'\n';
  select r.actividad_por into v_txt from fn_licitacion_relevancia(jsonb_build_object('codigo_principal_de_categoria', 'V1.72154028', 'descripci_n_del_procedimiento', 'x')) r;
  inf := inf || case when v_txt is null then 'OK    ' else 'FALLA ' end || 'un código 721540xx ya no da actividad' || E'\n';

  -- recálculo: una fila SIN fecha de cierre tiene que alcanzarse
  v_barrido := fn_licitaciones_barrido_abrir(now(), false);
  perform fn_licitaciones_ingerir(v_barrido, jsonb_build_array(jsonb_build_object('id_del_proceso', 'PRUEBA-149', 'codigo_principal_de_categoria', 'UNSPECIFIED',
    'descripci_n_del_procedimiento', 'Instalación de CCTV', 'entidad', 'ENTIDAD 149', 'modalidad_de_contratacion', 'Contratación régimen especial',
    'departamento_entidad', 'Distrito Capital de Bogotá', 'fecha_de_publicacion_del', hoy)));
  select estado into v_txt from licitaciones where id_del_proceso = 'PRUEBA-149';
  inf := inf || case when v_txt = 'prefiltrada' then 'OK    ' else 'FALLA ' end || 'control: la fila de prueba, sin cierre, está prefiltrada: ' || coalesce(v_txt, 'null') || E'\n';
  update licitacion_criterios set activo = false where tipo = 'palabra' and fn_licitacion_norm(valor) = 'cctv';
  perform fn_licitaciones_recalcular();
  select estado || ' ' || coalesce(actividad_por, 'sin actividad') into v_txt from licitaciones where id_del_proceso = 'PRUEBA-149';
  inf := inf || case when v_txt = 'detectada sin actividad' then 'OK    ' else 'FALLA ' end || 'recalcular alcanza lo que no trae cierre: ' || coalesce(v_txt, 'null') || E'\n';

  raise exception '%', inf || E'\n(Fin: este error es a propósito; todo lo de la prueba se deshizo.)';
end $$;
