// RRHH → Personal (migración 66). La ficha del empleado, copiada de NEXGO campo por campo
// (docs/nexgo-personal-ficha-empleado.md). Dos diferencias a propósito:
//   - Accesos: ninguna contraseña. La ficha se enlaza con el usuario del ERP (perfil_id).
//   - Sueldo/liquidación y Desprendible: el sistema NO calcula. Alejandra liquida por fuera y
//     registra acá los valores y el archivo ("la señora Alejandra hace eso y sube al sistema").

export const PESTANAS = [
  { id: "datos", nombre: "Datos" },
  { id: "hoja", nombre: "Hoja de vida" },
  { id: "contrato", nombre: "Contrato" },
  { id: "accesos", nombre: "Accesos" },
  { id: "dotacion", nombre: "Dotación" },
  { id: "sueldo", nombre: "Sueldo / liquidación" },
  { id: "desprendible", nombre: "Desprendible" },
  { id: "caja", nombre: "Caja menor" },
] as const;
export type Pestana = (typeof PESTANAS)[number]["id"];

/** Las de NEXGO, con su abreviatura (va junto al nombre en el carnet si se marca). */
export const TITULACIONES: { id: string; nombre: string; abreviatura: string | null }[] = [
  { id: "", nombre: "Sin titulación", abreviatura: null },
  { id: "ingeniero", nombre: "Ingeniero(a)", abreviatura: "Ing." },
  { id: "tecnologo", nombre: "Tecnólogo(a)", abreviatura: "Tnlgo." },
  { id: "tecnico", nombre: "Técnico(a)", abreviatura: "Téc." },
  { id: "profesional", nombre: "Profesional", abreviatura: "Prof." },
  { id: "arquitecto", nombre: "Arquitecto(a)", abreviatura: "Arq." },
  { id: "contador", nombre: "Contador(a) público", abreviatura: "C.P." },
  { id: "administrador", nombre: "Administrador(a)", abreviatura: "Adm." },
  { id: "licenciado", nombre: "Licenciado(a)", abreviatura: "Lic." },
  { id: "especialista", nombre: "Especialista", abreviatura: "Esp." },
  { id: "magister", nombre: "Magíster", abreviatura: "Mag." },
  { id: "doctor", nombre: "Doctor(a)", abreviatura: "Dr." },
  { id: "auxiliar", nombre: "Auxiliar", abreviatura: "Aux." },
  { id: "bachiller", nombre: "Bachiller académico", abreviatura: "Bach." },
];
export const TIPOS_DOC_IDENTIDAD = ["CC", "CE", "TI", "PA", "PPT", "NIT"] as const;
export const ESTADO_LABORAL: Record<string, string> = { activo: "Activo", en_pausa: "En pausa", retirado: "Retirado" };
export const TIPO_CONTRATO: Record<string, string> = {
  termino_fijo: "Término fijo",
  indefinido: "Término indefinido",
  obra_labor: "Obra o labor",
  prestacion_servicios: "Prestación de servicios",
};

export interface Empleado {
  id: string;
  perfil_id: string | null;
  primer_nombre: string;
  otros_nombres: string | null;
  primer_apellido: string;
  segundo_apellido: string | null;
  tipo_documento: string;
  numero_documento: string;
  codigo_interno: string | null;
  titulacion: string | null;
  mostrar_titulacion_carnet: boolean;
  cargo: string | null;
  area: string | null;
  estado_laboral: string;
  correo: string | null;
  telefono: string | null;
  ciudad: string | null;
  direccion: string | null;
  municipio_dane: string | null;
  fecha_nacimiento: string | null;
  rh: string | null;
  eps: string | null;
  afp: string | null;
  arl: string | null;
  caja_compensacion: string | null;
  contacto_emergencia: string | null;
  telefono_emergencia: string | null;
  fecha_ingreso: string;
  fecha_retiro: string | null;
  motivo_retiro: string | null;
  salario_base: number;
  bonificacion: number | null;
  rodamiento: number | null;
  detalle_bonificacion: string | null;
  tipo_contrato: string | null;
  aplica_auxilio_transporte: boolean;
  salario_integral: boolean;
  foto_path: string | null;
  notas_hoja_vida: string | null;
  talla_camisa: string | null;
  talla_pantalon: string | null;
  talla_botas: string | null;
}

export function nombreCompleto(e: Pick<Empleado, "primer_nombre" | "otros_nombres" | "primer_apellido" | "segundo_apellido">): string {
  return [e.primer_nombre, e.otros_nombres, e.primer_apellido, e.segundo_apellido].filter((x) => x && x.trim()).join(" ");
}

export function abreviaturaTitulacion(id: string | null): string | null {
  return TITULACIONES.find((t) => t.id === (id ?? ""))?.abreviatura ?? null;
}
