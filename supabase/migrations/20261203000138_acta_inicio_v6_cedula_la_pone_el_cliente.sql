-- Acta de inicio v6: la cédula del contratante deja de ser obligatoria para enviar.
--
-- Pedido de Jhojan (2026-11-04): "la cédula la debe llenar el cliente, para que dejemos
-- el campo libre para poder subir el documento para firma".
--
-- Antes, `contratante_cedula` era obligatoria, así que fn_sst_faltantes la exigía y
-- fn_sst_enviar_al_cliente se negaba a mandar el acta sin ella. Ahora el acta se envía
-- sin la cédula y el contratante la aporta al firmar: la firma guarda su documento en
-- sst_formato_firmas.documento, que es donde corresponde que quede — junto a la firma
-- que lo acredita, no en un campo que llenó otro.
--
-- La v6 se construye desde la v5 cambiando un solo campo, para no reescribir los 36.

update public.sst_plantillas
   set estado = 'archivada',
       archivada_en = now(),
       motivo_archivo = 'Reemplazada por la versión 6: la cédula del contratante la aporta él al firmar.'
 where codigo = 'PRY-ACTA-INICIO' and estado = 'publicada';

insert into public.sst_plantillas
  (codigo, nombre, version, descripcion, ambito, estado, publicada_en, plantilla_anterior_id, campos, firmas)
select
  'PRY-ACTA-INICIO',
  'Acta de inicio de obra',
  6,
  'Acta de inicio. Alcance y anticipo vienen del contrato. El cronograma se entrega aparte; el supervisor y la cédula del contratante los aporta el cliente.',
  'proyectos',
  'publicada',
  now(),
  (select id from public.sst_plantillas where codigo='PRY-ACTA-INICIO' and version=5),
  (
    select jsonb_agg(
      case
        when c->>'id' = 'contratante_cedula'
          then (c - 'obligatorio') || jsonb_build_object(
                 'ayuda', 'La aporta el contratante al firmar: queda registrada con su firma. No hace falta para enviarle el acta.')
        else c
      end
      order by idx
    )
    from public.sst_plantillas p, jsonb_array_elements(p.campos) with ordinality t(c, idx)
    where p.codigo = 'PRY-ACTA-INICIO' and p.version = 5
  ),
  (select firmas from public.sst_plantillas where codigo='PRY-ACTA-INICIO' and version=5)
where not exists (
  select 1 from public.sst_plantillas where codigo='PRY-ACTA-INICIO' and version=6
);

-- El acta de Tintalá sigue en borrador: pasa a la v6.
update public.sst_formatos
   set plantilla_id = (select id from public.sst_plantillas where codigo='PRY-ACTA-INICIO' and version=6)
 where id = '00000000-0000-4000-8000-000000151a01' and estado = 'borrador';

-- Verificado: v6 publicada, 36 campos y 2 firmas (iguales a la v5), contratante_cedula
-- sin 'obligatorio' y con su ayuda. fn_sst_faltantes del acta de Tintalá queda en
-- {"Inicio de labores"}: el único campo que todavía bloquea el envío.
