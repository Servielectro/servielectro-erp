-- Acta de inicio v5. Cambios pedidos por Jhojan el 2026-11-04:
--   * fuera el requisito de cronograma: se entrega aparte como entregable;
--   * el supervisor lo registra el CONTRATANTE, y no bloquea la firma;
--   * las firmas de los técnicos en obra no van: el personal se acredita con la
--     relación y las planillas de seguridad social (cláusula cuarta), que ya
--     estaban en la v4 y se conservan.
-- El alcance y el anticipo siguen saliendo del contrato confirmado (prellenar).
--
-- OJO para quien lea esto después: la cláusula quinta del contrato CSE-26-151 condiciona
-- el anticipo del 50% ($8.485.267) a pólizas aprobadas, acta de inicio Y cronograma.
-- Quitar la casilla del acta no quita la obligación del contrato: el cronograma se
-- entrega aparte y conviene dejar constancia de esa entrega en el expediente.

update public.sst_plantillas
   set estado = 'archivada',
       archivada_en = now(),
       motivo_archivo = 'Reemplazada por la versión 5: sin requisito de cronograma y con supervisor a cargo del contratante.'
 where codigo = 'PRY-ACTA-INICIO' and estado = 'publicada';

insert into public.sst_plantillas
  (codigo, nombre, version, descripcion, ambito, estado, publicada_en, plantilla_anterior_id, campos, firmas)
select
  'PRY-ACTA-INICIO',
  'Acta de inicio de obra',
  5,
  'Acta de inicio. El alcance y el anticipo vienen del contrato confirmado. El cronograma se entrega aparte; el supervisor lo registra el contratante.',
  'proyectos',
  'publicada',
  now(),
  (select id from public.sst_plantillas where codigo='PRY-ACTA-INICIO' and version=4),
  $campos$[
    {"id":"sec_reunion","tipo":"seccion","etiqueta":"Reunión"},
    {"id":"ciudad","tipo":"texto","etiqueta":"Ciudad","prellenar":"ciudad","obligatorio":true},
    {"id":"contratante_razon_social","tipo":"texto","etiqueta":"Contratante (razón social)","prellenar":"contratante_razon_social","obligatorio":true},
    {"id":"contratante_nit","tipo":"texto","etiqueta":"NIT del contratante","prellenar":"contratante_nit"},
    {"id":"contratante_nombre","tipo":"texto","etiqueta":"Por el contratante: nombre","prellenar":"contratante_nombre","obligatorio":true},
    {"id":"contratante_cedula","tipo":"texto","etiqueta":"Por el contratante: cédula","obligatorio":true},
    {"id":"contratante_calidad","tipo":"lista","etiqueta":"En calidad de","opciones":["Representante legal","Administrador","Delegado del consejo"],"obligatorio":true},
    {"id":"contratista_nombre","tipo":"texto","etiqueta":"Por el contratista: nombre","prellenar":"contratista_nombre","obligatorio":true},
    {"id":"contratista_cedula","tipo":"texto","etiqueta":"Por el contratista: cédula","prellenar":"contratista_cedula","obligatorio":true},
    {"id":"contratista_expedida_en","tipo":"texto","etiqueta":"Cédula expedida en","prellenar":"contratista_expedida_en"},

    {"id":"sec_lugar","tipo":"seccion","etiqueta":"Lugar y referencia"},
    {"id":"lugar_nombre","tipo":"texto","etiqueta":"Lugar donde se ejecutan los trabajos","prellenar":"lugar_nombre","obligatorio":true},
    {"id":"lugar_direccion","tipo":"texto","etiqueta":"Dirección","prellenar":"lugar_direccion","obligatorio":true},
    {"id":"referencia","tipo":"texto","etiqueta":"Referencia (contrato y cotización)","prellenar":"referencia","obligatorio":true},

    {"id":"sec_alcance","tipo":"seccion","etiqueta":"Donde se realizarán las siguientes actividades"},
    {"id":"alcance","tipo":"texto_largo","etiqueta":"Alcance","prellenar":"alcance","obligatorio":true,
     "ayuda":"Sale del contrato confirmado. Si lo cambias, el acta queda marcada como apartada del contrato."},

    {"id":"sec_requisitos","tipo":"seccion","etiqueta":"Requisitos previos",
     "ayuda":"Desde la firma de esta acta corre el plazo del contrato y la multa por día de retraso. Revisa que todo esté cumplido antes de firmar."},
    {"id":"req_polizas","tipo":"si_no","etiqueta":"Pólizas entregadas y aprobadas por el contratante","aviso_firma":true},
    {"id":"req_polizas_fecha","tipo":"fecha","etiqueta":"Fecha de aprobación de las pólizas"},
    {"id":"req_anticipo","tipo":"si_no","etiqueta":"Anticipo girado","aviso_firma":true},
    {"id":"req_anticipo_fecha","tipo":"fecha","etiqueta":"Fecha del giro del anticipo"},
    {"id":"req_anticipo_valor","tipo":"numero","etiqueta":"Valor del anticipo recibido","prellenar":"anticipo_valor",
     "ayuda":"Viene del contrato: el anticipo pactado. Si se recibió otra cantidad, corrígelo; el acta queda marcada como apartada del contrato."},
    {"id":"req_personal_planillas","tipo":"si_no","etiqueta":"Relación del personal con sus planillas de seguridad social, entregada","aviso_firma":true,
     "ayuda":"Lo exige la cláusula cuarta antes de firmar el acta. Con esto se acredita el personal: no se requiere que los técnicos firmen el acta."},
    {"id":"req_personal_nombres","tipo":"texto_largo","etiqueta":"Personal relacionado",
     "ayuda":"Los nombres que se entregaron a la administración."},

    {"id":"sec_supervision","tipo":"seccion","etiqueta":"Supervisión del contrato",
     "ayuda":"Lo diligencia el contratante. No es requisito para firmar el acta: queda como registro de a quién dirigir las comunicaciones de obra."},
    {"id":"supervisor_nombre","tipo":"texto","etiqueta":"Supervisor designado por el contratante"},
    {"id":"supervisor_cargo","tipo":"texto","etiqueta":"Cargo o calidad"},
    {"id":"supervisor_contacto","tipo":"texto","etiqueta":"Teléfono o correo de contacto"},

    {"id":"sec_plazo","tipo":"seccion","etiqueta":"Plazo"},
    {"id":"inicio_labores","tipo":"lista","etiqueta":"Inicio de labores","opciones":["El mismo día del acta","El día siguiente al acta"],"obligatorio":true,
     "ayuda":"De aquí sale desde qué día cuenta el plazo (y la multa)."},
    {"id":"plazo_dias_habiles","tipo":"numero","etiqueta":"Plazo del contrato (días hábiles)","prellenar":"plazo_dias_habiles","obligatorio":true},
    {"id":"fecha_inicio_oficial","tipo":"fecha","etiqueta":"Fecha de inicio oficial","calculado":"inicio_dias_habiles","inicio_campo":"inicio_labores",
     "ayuda":"El primer día que cuenta: el del acta si las labores inician ese mismo día; si no, el siguiente día hábil."},
    {"id":"fecha_terminacion_estimada","tipo":"fecha","etiqueta":"Fecha de terminación estimada","calculado":"terminacion_dias_habiles","plazo_campo":"plazo_dias_habiles","inicio_campo":"inicio_labores",
     "ayuda":"Días hábiles: lunes a sábado, sin festivos de Colombia, contados desde el inicio de labores."},

    {"id":"sec_observaciones","tipo":"seccion","etiqueta":"Observaciones"},
    {"id":"observaciones_cliente","tipo":"texto_largo","etiqueta":"Observaciones del cliente"},
    {"id":"observaciones_tecnico","tipo":"texto_largo","etiqueta":"Observaciones del técnico"}
  ]$campos$::jsonb,
  $firmas$[
    {"rol":"sst_cliente","etiqueta":"Por el contratante","obligatoria":true},
    {"rol":"responsable_sst","etiqueta":"Por el contratista (Servielectro SAS)","obligatoria":true}
  ]$firmas$::jsonb
where not exists (
  select 1 from public.sst_plantillas where codigo='PRY-ACTA-INICIO' and version=5
);

-- El acta de Tintalá sigue en borrador: se pasa a la v5 y se le quitan los campos retirados.
update public.sst_formatos f
   set plantilla_id = (select id from public.sst_plantillas where codigo='PRY-ACTA-INICIO' and version=5),
       respuestas   = f.respuestas - 'req_cronograma' - 'req_supervisor' - 'req_supervisor_nombre'
 where f.id = '00000000-0000-4000-8000-000000151a01'
   and f.estado = 'borrador';
