-- Verificación de modulo_sugerencias (migraciones sugerencias_por_modulo_rrhh_y_contable y
-- rol_contabilidad) CONTRA PRODUCCIÓN. Termina SIEMPRE en error a propósito: todo se deshace.
--
-- Cada prueba fuerza el rol 'authenticated' con el sub de un perfil y, ANTES de creerle a la
-- política, comprueba valores de control: current_user, auth.uid() y lo que dice fn_tiene_permiso
-- para ese perfil. Si el perfil tuviera permisos que no se esperan, el control lo dice y la prueba
-- no cuenta.
--
-- Contabilidad no tiene ningún perfil todavía: dentro de esta transacción «Técnico 1» pasa a ese
-- rol para probar ese lado, y al final se comprueba que el cambio se deshizo… desde afuera (corre
-- de nuevo estado-real o la consulta del rol).

do $$
declare
  inf text := E'INFORME SUGERENCIAS\n';
  v_ale uuid := '9312e69a-5a40-4f8c-bf9b-f799fd12d783';   -- Luz Alejandra Garzon, rol RRHH
  v_con uuid := '925739c5-5a65-4cb4-800d-a64d51a0096f';   -- Técnico 1, rol Contabilidad SOLO aquí
  v_jho uuid := '696d9431-5c4d-4043-aee4-3e4597094f26';   -- Jhojan, Administrador
  v_vic uuid := '463c48a9-af51-430e-aff6-2c1a5f4acbdd';   -- Victoria Suarez, rol SG-SST
  v_rol_cont uuid := (select id from roles where nombre = 'Contabilidad');
  v_s_rrhh uuid; v_s_cont uuid; v_n int; v_m int; v_txt text; v_ok boolean;

begin
  if v_rol_cont is null then raise exception 'No existe el rol Contabilidad.'; end if;
  update perfiles set rol_id = v_rol_cont where id = v_con;

  -- ── Alejandra (RRHH)
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_ale, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_ale::text, true);
  set local role authenticated;
  select current_user = 'authenticated' and auth.uid() = v_ale and fn_tiene_permiso('rrhh', 'trabajar') and not fn_tiene_permiso('contable', 'consultar')
    into v_ok;
  reset role;
  inf := inf || case when v_ok then 'OK    ' else 'FALLA ' end || 'control Alejandra: rol authenticated, uid suyo, RRHH trabajar, sin Contable' || E'\n';

  set local role authenticated;
  insert into modulo_sugerencias (modulo, texto, creado_por) values ('rrhh', 'Prueba RRHH (se deshace)', v_ale) returning id into v_s_rrhh;
  reset role;
  inf := inf || case when v_s_rrhh is not null then 'OK    ' else 'FALLA ' end || 'Alejandra escribe en RRHH' || E'\n';
  set local role authenticated;
  begin
    insert into modulo_sugerencias (modulo, texto, creado_por) values ('contable', 'Alejandra en contable', v_ale);
    reset role; inf := inf || E'FALLA Alejandra escribe en Contable: lo aceptó\n';
  exception when insufficient_privilege then reset role; inf := inf || E'OK    Alejandra escribe en Contable: rebotó\n'; end;
  set local role authenticated;
  begin
    insert into modulo_sugerencias (modulo, texto, creado_por) values ('rrhh', 'A nombre de Jhojan', v_jho);
    reset role; inf := inf || E'FALLA Alejandra escribe a nombre de otro: lo aceptó\n';
  exception when insufficient_privilege then reset role; inf := inf || E'OK    Alejandra escribe a nombre de otro: rebotó\n'; end;

  -- ── Contabilidad (Técnico 1, solo en esta transacción)
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_con, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_con::text, true);
  set local role authenticated;
  select current_user = 'authenticated' and auth.uid() = v_con and fn_tiene_permiso('contable', 'trabajar') and not fn_tiene_permiso('rrhh', 'consultar')
         and not fn_tiene_permiso('tecnico', 'consultar')
    into v_ok;
  reset role;
  inf := inf || case when v_ok then 'OK    ' else 'FALLA ' end || 'control Contabilidad: uid suyo, Contable trabajar, sin RRHH y sin el rol viejo (Técnicos)' || E'\n';
  set local role authenticated;
  insert into modulo_sugerencias (modulo, texto, creado_por) values ('contable', 'Prueba Contable (se deshace)', v_con) returning id into v_s_cont;
  select count(*) filter (where modulo = 'rrhh'), count(*) filter (where modulo = 'contable') into v_n, v_m from modulo_sugerencias;
  reset role;
  inf := inf || case when v_n = 0 and v_m >= 1 then 'OK    ' else 'FALLA ' end || 'Contabilidad NO ve RRHH (' || v_n || ') y ve Contable (' || v_m || ')' || E'\n';
  set local role authenticated;
  begin
    insert into modulo_sugerencias (modulo, texto, creado_por) values ('rrhh', 'Contadora en RRHH', v_con);
    reset role; inf := inf || E'FALLA Contabilidad escribe en RRHH: lo aceptó\n';
  exception when insufficient_privilege then reset role; inf := inf || E'OK    Contabilidad escribe en RRHH: rebotó\n'; end;
  set local role authenticated;
  update modulo_sugerencias set texto = 'tocada por contabilidad' where id = v_s_rrhh;
  get diagnostics v_n = row_count;
  reset role;
  inf := inf || case when v_n = 0 then 'OK    ' else 'FALLA ' end || 'Contabilidad no toca la de RRHH: no afectó nada (' || v_n || ')' || E'\n';

  -- ── Alejandra otra vez: no ve Contable; corrige y archiva lo suyo; no cambia de módulo; no borra
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_ale, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_ale::text, true);
  set local role authenticated;
  select auth.uid() = v_ale into v_ok;
  select count(*) filter (where modulo = 'rrhh'), count(*) filter (where modulo = 'contable') into v_n, v_m from modulo_sugerencias;
  reset role;
  inf := inf || case when v_ok and v_n >= 1 and v_m = 0 then 'OK    ' else 'FALLA ' end || 'Alejandra NO ve Contable (' || v_m || ') y ve RRHH (' || v_n || ')' || E'\n';
  set local role authenticated;
  update modulo_sugerencias set texto = 'Corregida por Alejandra' where id = v_s_rrhh;
  get diagnostics v_n = row_count;
  update modulo_sugerencias set archivada_en = now() where id = v_s_rrhh;
  get diagnostics v_m = row_count;
  reset role;
  inf := inf || case when v_n = 1 and v_m = 1 then 'OK    ' else 'FALLA ' end || 'Alejandra corrige y archiva la suya' || E'\n';
  set local role authenticated;
  begin
    update modulo_sugerencias set modulo = 'contable' where id = v_s_rrhh;
    reset role; inf := inf || E'FALLA cambiar de módulo: lo aceptó\n';
  exception when others then reset role; inf := inf || 'OK    cambiar de módulo: rebotó (' || left(sqlerrm, 45) || E')\n'; end;
  set local role authenticated;
  delete from modulo_sugerencias where id = v_s_rrhh;
  get diagnostics v_n = row_count;
  reset role;
  inf := inf || case when v_n = 0 then 'OK    ' else 'FALLA ' end || 'nadie borra: no afectó nada (' || v_n || ')' || E'\n';

  -- ── Jhojan ve las dos y su nombre, pero no corrige las ajenas
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_jho, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_jho::text, true);
  set local role authenticated;
  select auth.uid() = v_jho into v_ok;
  select count(*) into v_n from modulo_sugerencias where id in (v_s_rrhh, v_s_cont);
  select string_agg(nombre, ' y ' order by nombre) into v_txt from perfiles where id in (v_ale, v_con);
  update modulo_sugerencias set texto = 'tocada por Jhojan' where id = v_s_cont;
  get diagnostics v_m = row_count;
  reset role;
  inf := inf || case when v_ok and v_n = 2 then 'OK    ' else 'FALLA ' end || 'Jhojan ve las dos (' || v_n || ') y los autores: ' || coalesce(v_txt, 'NINGUNO') || E'\n';
  inf := inf || case when v_m = 0 then 'OK    ' else 'FALLA ' end || 'Jhojan no corrige la ajena: no afectó nada (' || v_m || ')' || E'\n';

  -- ── Victoria (SG-SST) no ve ninguna de las dos
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_vic, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_vic::text, true);
  set local role authenticated;
  select auth.uid() = v_vic and fn_tiene_permiso('sgsst', 'trabajar') and not fn_tiene_permiso('rrhh', 'consultar') and not fn_tiene_permiso('contable', 'consultar') into v_ok;
  select count(*) into v_n from modulo_sugerencias where id in (v_s_rrhh, v_s_cont);
  reset role;
  inf := inf || case when v_ok and v_n = 0 then 'OK    ' else 'FALLA ' end || 'SG-SST (Victoria) no ve las de RRHH ni Contable (' || v_n || E')\n';

  -- ── Secciones: el modelo es por exclusión; no hay filas que habiliten
  select count(*) into v_n from permisos_rol_seccion where seccion_id = 'sugerencias';
  inf := inf || 'info  filas de permisos_rol_seccion para «sugerencias»: ' || v_n || ' (0 = heredan el permiso del módulo)' || E'\n';

  raise exception '%', inf || E'\n(Fin: este error es a propósito; todo lo de la prueba se deshizo, también el rol de Técnico 1.)';
end $$;
