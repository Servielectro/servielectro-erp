// "Documentos por firmar" (migración 20261203000131): formatos SG-SST a los que convocaron a este
// usuario. v_mis_documentos_por_firmar filtra sola por auth.uid() y solo trae borradores.

export interface PorFirmar {
  formato_id: string;
  codigo: string;
  formato: string;
  fecha: string;
  lugar: string | null;
  tema: string | null;
  estado: string;
  mi_nombre: string;
  mi_documento: string;
  mi_cargo: string | null;
  convocado_en: string;
  ya_firme: boolean;
  material_id: string | null;
}

export const COLUMNAS_POR_FIRMAR = "formato_id, codigo, formato, fecha, lugar, tema, estado, mi_nombre, mi_documento, mi_cargo, convocado_en, ya_firme, material_id";
