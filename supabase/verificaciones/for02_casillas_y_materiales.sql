-- Verificación (solo lectura) del FOR-02 después de la migración 20261203000130.

-- 1) Registro de competencia guardado como arreglo JSON y fn_sst_faltantes sin quejas.
--    fn_sst_faltantes (migración 75) ya trata un arreglo vacío como "sin responder" y uno con
--    al menos una casilla como respondido; no se cambió.
select f.id, f.fecha, f.estado,
       jsonb_typeof(f.respuestas -> 'registro_competencia') as tipo,   -- esperado: array
       f.respuestas -> 'registro_competencia'               as marcadas,
       f.respuestas ->> 'registro_competencia_otro'         as otro_cual,
       public.fn_sst_faltantes(f.id)                        as faltantes -- esperado: {}
from public.sst_formatos f join public.sst_plantillas p on p.id = f.plantilla_id
where p.codigo = 'FOR-02'
order by f.creado_en desc;

-- 2) Material exigido y publicado.
select pm.codigo, pm.obligatorio, m.version, m.estado, m.path
from public.sst_plantilla_materiales pm
join public.sst_plantillas p on p.id = pm.plantilla_id and p.codigo = 'FOR-02'
left join public.sst_materiales m on m.codigo = pm.codigo and m.estado = 'publicado';
-- esperado: IND-SGSST · true · 1 · publicado · materiales/IND-SGSST/v1.pdf

-- 3) Lecturas de cada sesión (la evidencia).
select f.fecha, l.persona, l.documento, l.abierto_en, l.cerrado_en, l.segundos
from public.sst_material_lecturas l join public.sst_formatos f on f.id = l.formato_id
order by l.abierto_en desc limit 50;

-- 4) La sección nueva.
select * from public.modulo_secciones where modulo_id = 'sgsst' and seccion_id = 'materiales';
