-- Portal del cliente (134/135): la firma del contratante necesita SUBIR su imagen.
--
-- sst_formato_firmas.imagen_path es NOT NULL y tiene que vivir en el bucket sgsst, en
-- formatos/{formato_id}/firma-{id}.png. La 134 le dio al cliente la política para INSERTAR la fila
-- de la firma, pero ninguna para subir la imagen: el insert en storage.objects choca con
-- fn_sst_archivo_subible (exige permiso sobre el módulo) y la firma nunca llega a registrarse.
-- Es el mismo hueco que la 131 cerró para el convocado (sgsst_firma_convocado_insert).
--
-- Alcance, lo mínimo:
--   * solo la carpeta formatos/{id}/ de un formato que fn_cliente_ve_formato le deja ver;
--   * solo en borrador (lo exige también el trigger de la firma);
--   * solo archivos firma-*.png (no fotos, no evidencias, nada más en esa carpeta);
--   * sin update ni delete: lo subido no se reemplaza.
--
-- Además, LEER las imágenes de ese mismo formato (firmas y fotos del acta). Sin esto el cliente ve
-- el acta que firma, o la que le publicaron, con "(imagen no disponible)" en cada firma. Solo de
-- formatos que fn_cliente_ve_formato le deja ver: publicados o actas suyas por firmar.

drop policy if exists sgsst_firma_cliente_insert on storage.objects;
create policy sgsst_firma_cliente_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'sgsst'
    and (storage.foldername(name))[1] = 'formatos'
    and storage.filename(name) like 'firma-%.png'
    and public.fn_cliente_actual() is not null
    and exists (
      select 1 from public.sst_formatos f
      where f.id::text = (storage.foldername(name))[2]
        and f.estado = 'borrador'
        and public.fn_cliente_ve_formato(f.id)
    )
  );

drop policy if exists sgsst_formato_cliente_select on storage.objects;
create policy sgsst_formato_cliente_select on storage.objects for select to authenticated
  using (
    bucket_id = 'sgsst'
    and (storage.foldername(name))[1] = 'formatos'
    and public.fn_cliente_actual() is not null
    and exists (
      select 1 from public.sst_formatos f
      where f.id::text = (storage.foldername(name))[2]
        and public.fn_cliente_ve_formato(f.id)
    )
  );

-- Para probar con el perfil de solo rol Cliente (después de aplicar):
--   1) /cliente/firmas → abrir el acta → Firmar: debe quedar la fila en sst_formato_firmas con rol sst_cliente.
--   2) Intentar subir a formatos/{id_de_un_ATS_no_publicado}/firma-x.png con su sesión: debe fallar.
--   3) Intentar subir formatos/{id_del_acta}/foto.jpg: debe fallar (no es firma-*.png).
