-- Deshace 20260930000034 (no toca cotizaciones ya guardadas con bloques).
update valores_agregados_catalogo
set titulo = 'Gerenciamiento y carpeta de ingeniería',
    texto = $txt$Se realiza la entrega de la carpeta de ingeniería que incluye: Planimetría de cableado y tubería, posicionamiento en plano de dispositivos, cuadro de conexiones y configuración de colores punto por punto, fichas técnicas de equipos, certificado de capacitación a personal autorizado (Dossier relacionado con un proyecto de seguridad electrónica). ENTREGABLES ADICIONALES COMO VALOR AGREGADO: • AVANCE PARA GESTIÓN DOCUMENTAL DE MANTENIMIENTOS: • Bitácoras para registro de mantenimientos preventivos y correctivos del sistema • Hoja de vida de equipos para aseguramiento de los mismos en pólizas del conjunto • Viabilidad para procesos predictivos y proactivos del sistema con el fin de obtener el mayor rendimiento en ingeniería de mantenimientos basados en MRR y mejoramiento del sistema. • Programa de Gestión de Activos.$txt$
where titulo = E'VALORES AGREGADOS\nGERENCIAMIENTO Y CARPETA DE INGENIERÍA';
delete from valores_agregados_catalogo
where titulo = 'OBSERVACIONES ADICIONALES DE LA EMPRESA CON EL PROYECTO:';
alter table cotizaciones drop column if exists bloques_documento_definidos;
