// Portal del cliente (migraciones 20261203000134 y 135).
//
// El cliente NO tiene permiso sobre ningún módulo del ERP. Lo único que alcanza es lo que alguien
// de adentro PUBLICÓ (cliente_portal_documentos), el personal asignado a su obra
// (proyecto_personal) y las actas donde le toca firmar como contratante. Todo lo lee por las
// vistas v_cliente_* (SECURITY DEFINER, ya filtradas por su cliente): nunca por las tablas.

export const CATEGORIAS_PORTAL = [
  { id: "cotizacion", etiqueta: "Cotizaciones" },
  { id: "contrato", etiqueta: "Contratos" },
  { id: "poliza", etiqueta: "Pólizas" },
  { id: "pago_poliza", etiqueta: "Pagos de pólizas" },
  { id: "cronograma", etiqueta: "Cronogramas" },
  { id: "acta", etiqueta: "Actas" },
  { id: "informe", etiqueta: "Informes" },
  { id: "plano", etiqueta: "Planos" },
  { id: "manual", etiqueta: "Manuales" },
  { id: "factura", etiqueta: "Facturas" },
  { id: "otro", etiqueta: "Otros" },
] as const;

export type CategoriaPortal = (typeof CATEGORIAS_PORTAL)[number]["id"];

export const ETIQUETA_CATEGORIA: Record<string, string> = Object.fromEntries(CATEGORIAS_PORTAL.map((c) => [c.id, c.etiqueta]));

export const esCategoria = (c: string): c is CategoriaPortal => CATEGORIAS_PORTAL.some((x) => x.id === c);

/** Categoría que se PROPONE al publicar un documento del proyecto, según su tipo (migración 90). */
export function categoriaDeTipo(tipo: string): CategoriaPortal {
  switch (tipo) {
    case "cotizacion":
      return "cotizacion";
    case "contrato_firmado":
    case "contrato_borrador":
      return "contrato";
    case "poliza":
      return "poliza";
    case "comprobante_pago_poliza":
      return "pago_poliza";
    case "cronograma":
      return "cronograma";
    case "acta_inicio":
    case "acta_corte":
    case "acta_entrega":
    case "acta_liquidacion":
      return "acta";
    case "informe_tecnico":
    case "registro_fotografico":
      return "informe";
    case "plano":
      return "plano";
    case "cuenta_de_cobro":
      return "factura";
    default:
      return "otro";
  }
}

/** Tipo de documento de obra que se PROPONE al subir un archivo nuevo para publicarlo. */
export function tipoDeCategoria(c: CategoriaPortal): string {
  switch (c) {
    case "cotizacion":
      return "cotizacion";
    case "contrato":
      return "contrato_firmado";
    case "poliza":
      return "poliza";
    case "pago_poliza":
      return "comprobante_pago_poliza";
    case "cronograma":
      return "cronograma";
    case "informe":
      return "informe_tecnico";
    case "plano":
      return "plano";
    case "factura":
      return "cuenta_de_cobro";
    default:
      return "otro";
  }
}

export interface ProyectoCliente {
  id: string;
  codigo: string | null;
  nombre: string;
  estado: string;
  tipo_contrato: string | null;
  fecha_inicio: string | null;
  fecha_fin_estimada: string | null;
  contrato_firmado: boolean;
  documentos: number;
}
export const COLUMNAS_PROYECTO_CLIENTE = "id, codigo, nombre, estado, tipo_contrato, fecha_inicio, fecha_fin_estimada, contrato_firmado, documentos";

export interface DocumentoCliente {
  id: string;
  proyecto_id: string;
  proyecto_codigo: string | null;
  proyecto_nombre: string;
  categoria: string;
  titulo: string;
  descripcion: string | null;
  bucket: string | null;
  path: string | null;
  mime: string | null;
  bytes: number | null;
  formato_id: string | null;
  publicado_en: string;
}
export const COLUMNAS_DOCUMENTO_CLIENTE =
  "id, proyecto_id, proyecto_codigo, proyecto_nombre, categoria, titulo, descripcion, bucket, path, mime, bytes, formato_id, publicado_en";

export interface Formacion {
  tipo: string;
  nombre: string | null;
  nivel: string | null;
  tema: string | null;
  horas: number | null;
  entidad: string | null;
  fecha: string | null;
  vence_en: string | null;
}
export interface PersonalCliente {
  proyecto_id: string;
  empleado_id: string;
  nombre: string;
  tipo_documento: string | null;
  numero_documento: string | null;
  cargo: string | null;
  desde: string;
  hasta: string | null;
  formacion: Formacion[] | null;
}
export const COLUMNAS_PERSONAL_CLIENTE = "proyecto_id, empleado_id, nombre, tipo_documento, numero_documento, cargo, desde, hasta, formacion";

export interface PorFirmarCliente {
  formato_id: string;
  codigo: string;
  formato: string;
  fecha: string;
  proyecto_id: string;
  proyecto_codigo: string | null;
  estado: string;
  ya_firmado: boolean;
}
export const COLUMNAS_POR_FIRMAR_CLIENTE = "formato_id, codigo, formato, fecha, proyecto_id, proyecto_codigo, estado, ya_firmado";

export const TIPO_FORMACION: Record<string, string> = {
  certificado_alturas: "Trabajo en alturas",
  capacitacion: "Capacitación",
  certificado_afiliacion: "Afiliación",
};

export const NIVEL_ALTURAS: Record<string, string> = {
  basico_operativo: "Básico operativo",
  avanzado: "Avanzado",
  coordinador: "Coordinador",
  reentrenamiento: "Reentrenamiento",
  jefe_de_area: "Jefe de área",
};

/** Hoy en Bogotá (AAAA-MM-DD), para comparar vigencias. */
export function hoyBogota(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export function tamano(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function fechaCorta(iso: string | null): string {
  if (!iso) return "—";
  const d = iso.length === 10 ? new Date(`${iso}T12:00:00-05:00`) : new Date(iso);
  return new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeZone: "America/Bogota" }).format(d);
}
