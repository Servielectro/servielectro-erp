-- Verificación de la migración 147 CONTRA PRODUCCIÓN, y se revierte sola (termina SIEMPRE en
-- error a propósito: el informe viene en el mensaje y Postgres deshace todo).
-- Correr DESPUÉS de aplicar la 147. «rebotó» = la base lo rechazó, que es lo que se quería.
-- Se decide sobre una licitación REAL prefiltrada, como responsable real (rol forzado, con
-- auth.uid() de control), y todo se deshace al final.

do $$
declare
  inf text := E'INFORME 147\n';
  v_admin uuid; v_sin uuid; v_lic uuid; v_lic2 uuid; v_txt text; v_n int; v_estado text; v_control uuid;
  v_antes jsonb;
begin
  select string_agg(estado || '=' || n, ' ' order by estado) into v_txt
    from (select estado, count(*) n from licitaciones group by estado) e;
  inf := inf || 'info  estados: ' || coalesce(v_txt, '-') || E'\n';
  select count(*) into v_n from licitaciones where secop is not null and estado = 'detectada'
     and fn_licitacion_es_relevante(criterios_que_coinciden, afinidad);
  inf := inf || case when v_n = 0 then 'OK    ' else 'FALLA ' end || 'ninguna relevante del radar quedó en detectada: ' || v_n || E'\n';
  select count(*) into v_n from licitaciones where secop is not null and estado = 'prefiltrada'
     and not fn_licitacion_es_relevante(criterios_que_coinciden, afinidad);
  inf := inf || case when v_n = 0 then 'OK    ' else 'FALLA ' end || 'ninguna no relevante quedó en prefiltrada: ' || v_n || E'\n';
  select estado into v_txt from licitaciones where id_del_proceso = 'PN-ESPOL-MIC-020-2026';
  inf := inf || case when v_txt = 'adjudicada' then 'OK    ' else 'FALLA ' end || 'Policía sigue adjudicada: ' || coalesce(v_txt, '?') || E'\n';

  select p.id into v_admin from perfiles p join permisos_rol pr on pr.rol_id = p.rol_id and pr.modulo_id = 'licitaciones'
   where pr.nivel = 'responsable' and not fn_es_demo(p.id) limit 1;
  select p.id into v_sin from perfiles p join permisos_rol pr on pr.rol_id = p.rol_id and pr.modulo_id = 'licitaciones'
   where pr.nivel <> 'responsable' limit 1;
  select id into v_lic from licitaciones where estado = 'prefiltrada' and secop is not null order by traida_en limit 1;
  select id into v_lic2 from licitaciones where estado = 'prefiltrada' and secop is not null and id <> v_lic order by traida_en limit 1;
  select to_jsonb(l) - 'estado' - 'revisado_por' - 'revisado_en' - 'motivo_descarte' - 'updated_at' into v_antes from licitaciones l where id = v_lic;
  inf := inf || 'info  responsable ' || coalesce(v_admin::text, 'NINGUNO') || ' · con el módulo sin ser responsable ' || coalesce(v_sin::text, 'ninguno')
         || ' · licitación de prueba ' || coalesce((select id_del_proceso from licitaciones where id = v_lic), 'NINGUNA') || E'\n';

  -- saltar la puerta con un UPDATE
  begin
    update licitaciones set estado = 'en_preparacion' where id = v_lic;
    inf := inf || E'FALLA saltar la puerta con un UPDATE: lo aceptó\n';
  exception when check_violation then inf := inf || E'OK    saltar la puerta con un UPDATE: rebotó\n'; end;

  -- sin sesión
  begin
    perform fn_licitacion_decidir(v_lic, 'go', 'Prueba de verificación 147, se deshace');
    inf := inf || E'FALLA decidir sin sesión: lo aceptó\n';
  exception when others then inf := inf || 'OK    decidir sin sesión: rebotó (' || left(sqlerrm, 50) || E')\n'; end;

  -- quien tiene el módulo sin ser responsable
  if v_sin is not null then
    perform set_config('request.jwt.claims', jsonb_build_object('sub', v_sin, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', v_sin::text, true);
    begin
      perform fn_licitacion_decidir(v_lic, 'go', 'Prueba de verificación 147, se deshace');
      inf := inf || E'FALLA decide quien no es responsable: lo aceptó\n';
    exception when others then inf := inf || 'OK    decide quien no es responsable: rebotó (' || left(sqlerrm, 60) || E')\n'; end;
  else
    inf := inf || E'info  nadie tiene el módulo sin ser responsable: no se prueba\n';
  end if;

  -- el responsable: sin razón rebota; con razón, GO
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  select auth.uid() into v_control;
  inf := inf || case when v_control = v_admin then 'OK    ' else 'FALLA ' end || 'control: auth.uid() es el responsable' || E'\n';
  begin
    perform fn_licitacion_decidir(v_lic, 'go', 'corta');
    inf := inf || E'FALLA GO sin razón suficiente: lo aceptó\n';
  exception when others then inf := inf || E'OK    GO sin razón suficiente: rebotó\n'; end;
  v_estado := fn_licitacion_decidir(v_lic, 'go', 'Prueba de verificación 147: se deshace al final');
  inf := inf || case when v_estado = 'en_preparacion' then 'OK    ' else 'FALLA ' end || 'GO → ' || coalesce(v_estado, 'null') || E'\n';
  select count(*) into v_n from licitacion_decisiones where licitacion_id = v_lic and decidida_por = v_admin and decision = 'go'
     and estado_antes = 'prefiltrada' and estado_despues = 'en_preparacion' and jsonb_array_length(contexto -> 'calces') > 0;
  inf := inf || case when v_n = 1 then 'OK    ' else 'FALLA ' end || 'registro con quién, de dónde a dónde y los calces' || E'\n';
  select array_to_string(array(select c.valor from fn_licitacion_calces(v_lic) c), ', ') into v_txt;
  inf := inf || 'info  calces: ' || coalesce(v_txt, '-') || E'\n';
  begin
    update licitacion_decisiones set razon = 'cambiada por la verificación' where licitacion_id = v_lic;
    inf := inf || E'FALLA editar una decisión: lo aceptó\n';
  exception when others then inf := inf || E'OK    editar una decisión: rebotó\n'; end;
  if v_lic2 is not null then
    v_estado := fn_licitacion_decidir(v_lic2, 'no_go', 'Prueba de verificación 147 (NO-GO): se deshace');
    select count(*) into v_n from licitaciones where id = v_lic2 and estado = 'descartada' and motivo_descarte like 'Prueba de verificación 147%';
    inf := inf || case when v_n = 1 then 'OK    ' else 'FALLA ' end || 'NO-GO → descartada con el motivo' || E'\n';
  end if;

  -- RLS de las decisiones, rol forzado
  set local role authenticated;
  select count(*) into v_n from licitacion_decisiones where licitacion_id = v_lic;
  select current_user into v_txt;
  reset role;
  inf := inf || case when v_n = 1 and v_txt = 'authenticated' then 'OK    ' else 'FALLA ' end || 'RLS: el responsable ve la decisión (' || v_n || ', rol ' || v_txt || E')\n';
  set local role authenticated;
  begin
    insert into licitacion_decisiones (licitacion_id, decision, razon, decidida_por, estado_antes, estado_despues, contexto)
    values (v_lic, 'go', 'insertada a mano por la verificación', v_admin, 'x', 'y', '{}');
    reset role;
    inf := inf || E'FALLA insertar una decisión a mano (sin la función): lo aceptó\n';
  exception when insufficient_privilege then reset role; inf := inf || E'OK    insertar una decisión a mano: rebotó\n'; end;

  -- lo demás de la fila quedó igual
  if (select to_jsonb(l) - 'estado' - 'revisado_por' - 'revisado_en' - 'motivo_descarte' - 'updated_at' from licitaciones l where id = v_lic) = v_antes then
    inf := inf || E'OK    la decisión solo tocó estado y revisado_*\n';
  else
    inf := inf || E'FALLA la decisión tocó otras columnas\n';
  end if;
  select estado into v_txt from v_licitaciones_radar where id = v_lic;
  inf := inf || case when v_txt = 'en_preparacion' then 'OK    ' else 'FALLA ' end || 'la vista del radar trae el estado' || E'\n';

  raise exception '%', inf || E'\n(Fin: este error es a propósito; todo lo de la prueba se deshizo.)';
end $$;
