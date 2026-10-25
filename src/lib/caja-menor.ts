// Caja menor (migraciones 66 y 69): viáticos para obra fuera de la ciudad. RRHH asigna un monto;
// el técnico cuya ficha está enlazada a su usuario registra cada gasto con la foto de la factura.
// El saldo (asignado − gastos no anulados) lo calcula la vista v_caja_menor_recibos: acá solo se
// muestra. Pasarse del saldo no se bloquea: se marca en rojo con el excedente.
// Las fotos van a rrhh-soportes, carpeta caja-menor/{recibo}/ (la misma para técnico y RRHH).

export interface CajaMenor {
  id: string;
  empleado_id: string;
  concepto: string;
  proyecto_id: string | null;
  fecha_entrega: string;
  monto_asignado: number;
  estado: "abierta" | "cerrada";
  cerrada_en: string | null;
  gastado: number;
  saldo: number;
  excedente: number;
  anulado_en: string | null;
  motivo_anulacion: string | null;
}
export const COLUMNAS_CAJA =
  "id, empleado_id, concepto, proyecto_id, fecha_entrega, monto_asignado, estado, cerrada_en, gastado, saldo, excedente, anulado_en, motivo_anulacion";

export interface GastoCaja {
  id: string;
  recibo_id: string;
  fecha: string;
  concepto: string;
  documento_soporte: string | null;
  valor: number;
  registrado_por: string | null;
  registrado_en: string;
  anulada_en: string | null;
  motivo_anulacion: string | null;
}
export const COLUMNAS_GASTO_CAJA =
  "id, recibo_id, fecha, concepto, documento_soporte, valor, registrado_por, registrado_en, anulada_en, motivo_anulacion";

export interface FotoCaja {
  recibo_id: string;
  linea_id: string | null;
  storage_path: string;
  nombre_archivo: string | null;
}
export const COLUMNAS_FOTO_CAJA = "recibo_id, linea_id, storage_path, nombre_archivo";

/** Carpeta de las fotos de una caja en rrhh-soportes. */
export const carpetaCaja = (reciboId: string) => `caja-menor/${reciboId}`;
