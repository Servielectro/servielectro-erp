-- Cotizador — bloques del documento seleccionables (generaliza la migración 30).
--
-- Pedido de Jhojan 2026-09-30: todo el texto fijo entre el resumen de la oferta y las
-- condiciones comerciales pasa a ser elegible por cotización, igual que los valores
-- agregados: cada bloque tiene un título (el encabezado de la sección que se imprime)
-- y un texto, se marca o no, se edita en esa cotización y se ordena.
--
-- Se reutilizan las tablas de la migración 30 (valores_agregados_catalogo y
-- cotizacion_valores_agregados): ahora guardan bloques del documento en general.
--
-- Resaltado en rojo: lo que va entre **dobles asteriscos** sale en rojo en el documento
-- (así se conservan las partes resaltadas del texto original y se pueden editar).
--
-- Cotizaciones ya guardadas NO cambian: la marca nueva `bloques_documento_definidos`
-- solo la ponen las cotizaciones guardadas desde ahora. Las anteriores siguen
-- imprimiendo lo de siempre (bloque fijo de observaciones incluido).
--
-- Idempotente. Requiere la 30.

alter table cotizaciones
  add column if not exists bloques_documento_definidos boolean not null default false;

-- 1) Observaciones: el texto real del documento de Jhojan, con sus 8 resaltados.
insert into valores_agregados_catalogo (titulo, texto, orden) values (
  'OBSERVACIONES ADICIONALES DE LA EMPRESA CON EL PROYECTO:',
  $txt$**Junto con la planeación y para el inicio y durante el proyecto se entrega:** • **Acta de constitución de proyecto** mediante metodologías de Gestión de Proyectos (Project Charter - documento formal que autoriza el inicio, objetivos, alcance, gerente asignado y presupuesto inicial) • Cronograma basado en tiempos de ejecución y priorización de costos de activos y mano de obra. • **Documentación de Acta de Inicio de obra** para stakeholders del proyecto (involucrados en el proyecto). • Planeación de criticidad y fases de proyecto para seguimiento del mismo; **Plan para la Dirección del Proyecto:** El plan integral que guía la ejecución. • **Documentación de personal** de ejecución (Parafiscales, certificados de manejo de marca, certificado de EPP's). • **Informes de Estado y Progreso:** Documentos periódicos sobre el desempeño (avance, presupuesto, hitos). • **Informe Final del Proyecto:** Resumen del desempeño, metas alcanzadas y desviaciones. • Documentación Técnica/Manuales: Manuales de usuario, documentación técnica de producto o planos finales. • **Cierre Administrativo y Contractual:** Liquidación de contratos, pagos finales y liberación de recursos.$txt$,
  2
)
on conflict (titulo) do nothing;

-- 2) El bloque de valores agregados sembrado en la 30: su título pasa a ser el
--    encabezado completo que se imprimía ("VALORES AGREGADOS" + subtítulo) y su texto
--    marca el resaltado. Solo si nadie lo editó todavía (texto idéntico al sembrado).
update valores_agregados_catalogo
set titulo = E'VALORES AGREGADOS\nGERENCIAMIENTO Y CARPETA DE INGENIERÍA',
    texto = $txt$Se realiza la entrega de la carpeta de ingeniería que incluye: Planimetría de cableado y tubería, posicionamiento en plano de dispositivos, cuadro de conexiones y configuración de colores punto por punto, fichas técnicas de equipos, certificado de capacitación a personal autorizado (Dossier relacionado con un proyecto de seguridad electrónica). **ENTREGABLES ADICIONALES COMO VALOR AGREGADO:** • AVANCE PARA GESTIÓN DOCUMENTAL DE MANTENIMIENTOS: • Bitácoras para registro de mantenimientos preventivos y correctivos del sistema • Hoja de vida de equipos para aseguramiento de los mismos en pólizas del conjunto • Viabilidad para procesos predictivos y proactivos del sistema con el fin de obtener el mayor rendimiento en ingeniería de mantenimientos basados en MRR y mejoramiento del sistema. • Programa de Gestión de Activos.$txt$,
    orden = 1
where titulo = 'Gerenciamiento y carpeta de ingeniería'
  and texto = $txt$Se realiza la entrega de la carpeta de ingeniería que incluye: Planimetría de cableado y tubería, posicionamiento en plano de dispositivos, cuadro de conexiones y configuración de colores punto por punto, fichas técnicas de equipos, certificado de capacitación a personal autorizado (Dossier relacionado con un proyecto de seguridad electrónica). ENTREGABLES ADICIONALES COMO VALOR AGREGADO: • AVANCE PARA GESTIÓN DOCUMENTAL DE MANTENIMIENTOS: • Bitácoras para registro de mantenimientos preventivos y correctivos del sistema • Hoja de vida de equipos para aseguramiento de los mismos en pólizas del conjunto • Viabilidad para procesos predictivos y proactivos del sistema con el fin de obtener el mayor rendimiento en ingeniería de mantenimientos basados en MRR y mejoramiento del sistema. • Programa de Gestión de Activos.$txt$;
