// Personal en SG-SST (migración 107): tipos de documento, etiquetas y el semáforo de vigencias.
// Las reglas (quién registra qué, lo reservado, que nada se borre) las exige la base.

export type TipoDocPersona = "aptitud_ocupacional" | "certificado_alturas" | "capacitacion" | "certificado_afiliacion" | "historia_clinica" | "otro";

export const TIPOS_DOC_PERSONA: { id: TipoDocPersona; nombre: string; ayuda: string; sst: boolean }[] = [
  { id: "aptitud_ocupacional", nombre: "Certificado de aptitud (examen médico)", ayuda: "Apto, apto con restricciones o no apto, y las recomendaciones laborales. Nunca el diagnóstico.", sst: true },
  { id: "certificado_alturas", nombre: "Certificado de trabajo en alturas", ayuda: "Constancia de capacitación o certificado de competencia, con su nivel y vencimiento.", sst: true },
  { id: "capacitacion", nombre: "Capacitación", ayuda: "Inducción, reinducción, cursos: tema, horas y entidad.", sst: true },
  { id: "certificado_afiliacion", nombre: "Afiliación (EPS, AFP, ARL, caja)", ayuda: "El certificado de afiliación. Lo registra RRHH o SG-SST; SG-SST lo verifica.", sst: false },
  { id: "otro", nombre: "Otro documento", ayuda: "Lo que no encaja en los anteriores.", sst: false },
];
export const NOMBRE_TIPO_DOC: Record<string, string> = {
  ...Object.fromEntries(TIPOS_DOC_PERSONA.map((t) => [t.id, t.nombre])),
  historia_clinica: "Historia clínica (reservada)",
};

export const EXAMENES = [
  { id: "ingreso", nombre: "Ingreso" },
  { id: "periodico", nombre: "Periódico" },
  { id: "retiro", nombre: "Retiro" },
  { id: "post_incapacidad", nombre: "Post-incapacidad" },
  { id: "reintegro", nombre: "Reintegro" },
  { id: "cambio_de_cargo", nombre: "Cambio de cargo" },
];
export const RESULTADOS = [
  { id: "apto", nombre: "Apto" },
  { id: "apto_con_restricciones", nombre: "Apto con restricciones" },
  { id: "no_apto", nombre: "No apto" },
  { id: "aplazado", nombre: "Aplazado" },
];
export const ENFASIS = [
  { id: "alturas", nombre: "Trabajo en alturas" },
  { id: "espacios_confinados", nombre: "Espacios confinados" },
  { id: "riesgo_electrico", nombre: "Riesgo eléctrico" },
  { id: "conduccion", nombre: "Conducción" },
];
export const NIVELES_ALTURAS = [
  { id: "basico_operativo", nombre: "Básico operativo" },
  { id: "avanzado", nombre: "Avanzado" },
  { id: "reentrenamiento", nombre: "Reentrenamiento" },
  { id: "coordinador", nombre: "Coordinador de trabajo en alturas" },
  { id: "jefe_de_area", nombre: "Jefe de área" },
];
export const SUBSISTEMAS = [
  { id: "eps", nombre: "EPS" },
  { id: "afp", nombre: "AFP (pensión)" },
  { id: "arl", nombre: "ARL" },
  { id: "ccf", nombre: "Caja de compensación" },
];
export const ESTADOS_EPP = [
  { id: "bueno", nombre: "Bueno" },
  { id: "regular", nombre: "Regular" },
  { id: "malo", nombre: "Malo" },
  { id: "para_reponer", nombre: "Para reponer" },
];
export const nombreDe = (lista: { id: string; nombre: string }[], id: string | null | undefined) => lista.find((x) => x.id === id)?.nombre ?? id ?? "—";

export interface DocPersona {
  id: string;
  empleado_id: string | null;
  contratista_trabajador_id: string | null;
  tipo: TipoDocPersona;
  nombre: string | null;
  entidad: string | null;
  fecha_documento: string | null;
  vigente_desde: string | null;
  vence_en: string | null;
  examen: string | null;
  resultado: string | null;
  enfasis: string[];
  recomendaciones: string | null;
  custodia_ips: string | null;
  nivel: string | null;
  tema: string | null;
  horas: number | null;
  subsistema: string | null;
  path: string | null;
  nombre_archivo: string | null;
  reservado: boolean;
  notas: string | null;
  verificado_por: string | null;
  verificado_en: string | null;
  subido_en: string;
  archivado: boolean;
  motivo_archivo: string | null;
}
export const COLUMNAS_DOC_PERSONA =
  "id, empleado_id, contratista_trabajador_id, tipo, nombre, entidad, fecha_documento, vigente_desde, vence_en, examen, resultado, enfasis, recomendaciones, custodia_ips, nivel, tema, horas, subsistema, path, nombre_archivo, reservado, notas, verificado_por, verificado_en, subido_en, archivado, motivo_archivo";

export const BUCKET_SST_PERSONAL = "sst-personal";
/** Por vencer: dentro de estos días. */
export const DIAS_POR_VENCER = 30;

export type Semaforo = "vigente" | "por_vencer" | "vencido" | "sin_fecha" | "sin_registro";
export const SEMAFORO: Record<Semaforo, { nombre: string; clase: string }> = {
  vigente: { nombre: "Vigente", clase: "bg-green-100 text-green-800" },
  por_vencer: { nombre: "Por vencer", clase: "bg-amber-100 text-amber-900" },
  vencido: { nombre: "Vencido", clase: "bg-red-100 text-red-800" },
  sin_fecha: { nombre: "Sin vencimiento anotado", clase: "bg-slate-100 text-slate-700" },
  sin_registro: { nombre: "Sin registro", clase: "bg-slate-100 text-slate-500" },
};

const hoyBogota = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
const masDias = (fecha: string, dias: number) => {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
};

/** El estado de un vencimiento a una fecha (por defecto, hoy en Bogotá). */
export function semaforo(venceEn: string | null | undefined, hayRegistro: boolean, aFecha = hoyBogota()): Semaforo {
  if (!hayRegistro) return "sin_registro";
  if (!venceEn) return "sin_fecha";
  if (venceEn < aFecha) return "vencido";
  if (venceEn <= masDias(aFecha, DIAS_POR_VENCER)) return "por_vencer";
  return "vigente";
}

/** El documento más reciente (por inicio de vigencia o fecha) de un tipo, sin los archivados. */
export function vigenteDe(docs: DocPersona[], tipo: TipoDocPersona, filtro?: (d: DocPersona) => boolean): DocPersona | null {
  const lista = docs.filter((d) => d.tipo === tipo && !d.archivado && (!filtro || filtro(d)));
  lista.sort((a, b) => (b.vigente_desde ?? b.fecha_documento ?? b.subido_en).localeCompare(a.vigente_desde ?? a.fecha_documento ?? a.subido_en));
  return lista[0] ?? null;
}

/** Clave de la persona en la URL y en la carpeta: e-{empleado} o c-{trabajador de contratista}. */
export type ClavePersona = `e-${string}` | `c-${string}`;
