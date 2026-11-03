-- Primer material de capacitación: IND-SGSST v1 (Inducción y reinducción SG-SST 2026).
-- Requiere la migración 20261203000130 aplicada.
--
-- CAMINO CORTO (recomendado): entrar al ERP → SG-SST → Materiales de capacitación → Subir material,
-- con código IND-SGSST, nombre "Inducción y reinducción SG-SST 2026", 10 minutos y el PDF. La
-- pantalla calcula el sha256, sube a materiales/IND-SGSST/v1.pdf y registra. No hace falta esto.
--
-- CAMINO MANUAL (si se sube por el panel de Supabase):
--   1) Storage → sgsst → carpeta materiales/IND-SGSST → subir el archivo renombrado a v1.pdf
--      Archivo: C:\Users\servi\OneDrive\BACKUP\SIG 2026\2026. SERVIELECTRO INDUCCION Y REINDUCCION-SG-SST.pdf
--   2) Correr este bloque en el SQL editor.
--
-- No inventa nada: sha256 y tamaño son los del archivo de OneDrive (calculados el 2026-11-03,
-- 10 láminas). Si el objeto subido no pesa eso, no inserta y lo dice. Si ya está, no repite.
-- subido_por: en el SQL editor no hay auth.uid(); se pone quien creó la sesión FOR-02 más
-- reciente (la inducción de hoy). Si no hay ninguna, falla y lo dice.

do $$
declare
  v_path  text := 'materiales/IND-SGSST/v1.pdf';
  v_bytes bigint;
  v_quien uuid;
  v_id    uuid;
begin
  select id into v_id from public.sst_materiales where codigo = 'IND-SGSST' and version = 1;
  if v_id is not null then
    raise notice 'Ya estaba registrado: sst_materiales.id = %', v_id;
    return;
  end if;

  select (metadata ->> 'size')::bigint into v_bytes
  from storage.objects where bucket_id = 'sgsst' and name = v_path;
  if v_bytes is null then
    raise exception 'No encuentro el archivo en Storage: sgsst/%. Revisa la carpeta y el nombre.', v_path;
  end if;
  if v_bytes <> 770583 then
    raise exception 'El archivo subido pesa % bytes y la presentación pesa 770583: no es el mismo archivo.', v_bytes;
  end if;

  select f.creado_por into v_quien
  from public.sst_formatos f join public.sst_plantillas p on p.id = f.plantilla_id
  where p.codigo = 'FOR-02' order by f.creado_en desc limit 1;
  if v_quien is null then
    raise exception 'No hay ninguna sesión FOR-02 para tomar quién sube: use la pantalla de Materiales.';
  end if;

  insert into public.sst_materiales
    (codigo, nombre, version, descripcion, path, nombre_archivo, mime, bytes, sha256, minutos_lectura,
     estado, vigente_desde, subido_por)
  values
    ('IND-SGSST', 'Inducción y reinducción SG-SST 2026', 1, 'Presentación de inducción y reinducción SG-SST (10 láminas).',
     v_path, '2026. SERVIELECTRO INDUCCION Y REINDUCCION-SG-SST.pdf', 'application/pdf', 770583,
     '9cc91b19d353d08daef519be8663d652e56c8fa51cda4ee6eaf476391d8644ed', 10,
     'publicado', (now() at time zone 'America/Bogota')::date, v_quien)
  returning id into v_id;
  raise notice 'IND-SGSST v1 publicado: sst_materiales.id = %', v_id;
end $$;

-- Comprobación:
select id, codigo, version, estado, vigente_desde, bytes, sha256, minutos_lectura
from public.sst_materiales where codigo = 'IND-SGSST';
-- esperado: 1 fila · IND-SGSST · 1 · publicado · 2026-11-03 · 770583 · 9cc91b19…44ed · 10
