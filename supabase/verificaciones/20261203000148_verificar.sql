-- Verificación de la 148 CONTRA PRODUCCIÓN, y se revierte sola (termina SIEMPRE en error a
-- propósito). Inserta filas de prueba en storage.objects con el rol forzado: no sube ningún archivo.
-- auth.uid() y el rol se comprueban como valores de control antes de creer cada resultado.

do $$
declare
  inf text := E'INFORME 148\n';
  v_resp uuid; v_trab uuid; v_sin uuid; v_lic uuid; v_n int; v_rol text; v_uid uuid;
  v_ruta text;
begin
  select p.id into v_resp from perfiles p join permisos_rol pr on pr.rol_id = p.rol_id and pr.modulo_id = 'licitaciones'
   where pr.nivel = 'responsable' and not fn_es_demo(p.id) limit 1;
  select p.id into v_trab from perfiles p join permisos_rol pr on pr.rol_id = p.rol_id and pr.modulo_id = 'licitaciones'
   where pr.nivel = 'trabajar' limit 1;
  select p.id into v_sin from perfiles p where not exists (select 1 from permisos_rol pr where pr.rol_id = p.rol_id and pr.modulo_id = 'licitaciones') limit 1;
  select id into v_lic from licitaciones where secop is not null limit 1;
  v_ruta := v_lic::text || '/' || repeat('a', 64) || '.pdf';
  inf := inf || 'info  responsable ' || coalesce(v_resp::text, 'NINGUNO') || ' · trabaja ' || coalesce(v_trab::text, 'ninguno')
         || ' · sin el módulo ' || coalesce(v_sin::text, 'ninguno') || E'\n';
  select count(*) into v_n from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'licitaciones_archivos_%';
  inf := inf || case when v_n = 3 then 'OK    ' else 'FALLA ' end || 'políticas del bucket: ' || v_n || ' de 3' || E'\n';
  select public::text into v_rol from storage.buckets where id = 'licitaciones';
  inf := inf || case when v_rol = 'false' then 'OK    ' else 'FALLA ' end || 'el bucket es privado' || E'\n';

  -- quien trabaja sube
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_trab, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_trab::text, true);
  set local role authenticated;
  select current_user, auth.uid() into v_rol, v_uid;
  begin
    insert into storage.objects (bucket_id, name) values ('licitaciones', v_ruta);
    reset role;
    inf := inf || case when v_rol = 'authenticated' and v_uid = v_trab then 'OK    ' else 'FALLA ' end || 'quien trabaja sube un PDF (control: rol ' || v_rol || E')\n';
  exception when others then reset role; inf := inf || 'FALLA quien trabaja no pudo subir: ' || sqlerrm || E'\n'; end;

  -- ejecutable y carpeta inexistente
  set local role authenticated;
  begin
    insert into storage.objects (bucket_id, name) values ('licitaciones', v_lic::text || '/x.exe');
    reset role; inf := inf || E'FALLA subir un .exe: lo aceptó\n';
  exception when insufficient_privilege then reset role; inf := inf || E'OK    subir un .exe: rebotó\n'; end;
  set local role authenticated;
  begin
    insert into storage.objects (bucket_id, name) values ('licitaciones', gen_random_uuid()::text || '/x.pdf');
    reset role; inf := inf || E'FALLA subir a una licitación que no existe: lo aceptó\n';
  exception when insufficient_privilege then reset role; inf := inf || E'OK    subir a una licitación que no existe: rebotó\n'; end;

  -- quien trabaja ve, pero no borra ni edita
  set local role authenticated;
  select count(*) into v_n from storage.objects where bucket_id = 'licitaciones' and name = v_ruta;
  reset role;
  inf := inf || case when v_n = 1 then 'OK    ' else 'FALLA ' end || 'quien trabaja ve el archivo: ' || v_n || E'\n';
  set local role authenticated;
  update storage.objects set name = name where bucket_id = 'licitaciones' and name = v_ruta;
  get diagnostics v_n = row_count;
  reset role;
  inf := inf || case when v_n = 0 then 'OK    ' else 'FALLA ' end || 'quien trabaja no edita: no afectó nada (' || v_n || E' filas)\n';
  -- Borrar no se puede probar con un DELETE: Supabase lo prohíbe en storage.objects a todos
  -- (storage.protect_delete; se borra por la Storage API). Se comprueba la definición de la política.
  select count(*) into v_n from pg_policies where schemaname = 'storage' and tablename = 'objects'
     and policyname = 'licitaciones_archivos_borrar' and cmd = 'DELETE' and qual ~ 'responsable' and qual ~ 'licitaciones';
  inf := inf || case when v_n = 1 then 'OK    ' else 'FALLA ' end || 'borrar exige responsable (leído de la política; un DELETE directo no prueba nada acá)' || E'\n';

  -- sin el módulo
  if v_sin is not null then
    perform set_config('request.jwt.claims', jsonb_build_object('sub', v_sin, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', v_sin::text, true);
    set local role authenticated;
    select count(*), auth.uid() into v_n, v_uid from storage.objects where bucket_id = 'licitaciones' and name = v_ruta group by 2;
    reset role;
    inf := inf || case when coalesce(v_n, 0) = 0 then 'OK    ' else 'FALLA ' end || 'sin el módulo ve 0 archivos' || E'\n';
    set local role authenticated;
    begin
      insert into storage.objects (bucket_id, name) values ('licitaciones', v_lic::text || '/' || repeat('b', 64) || '.pdf');
      reset role; inf := inf || E'FALLA sin el módulo subió: lo aceptó\n';
    exception when insufficient_privilege then reset role; inf := inf || E'OK    sin el módulo no sube: rebotó\n'; end;
  else
    inf := inf || E'info  todos los perfiles tienen el módulo: no se prueba el «sin módulo»\n';
  end if;

  raise exception '%', inf || E'\n(Fin: este error es a propósito; todo lo de la prueba se deshizo.)';
end $$;
