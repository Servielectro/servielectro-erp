import type { Empleado } from "@/lib/personal";

// Los campos de la pestaña Datos de la ficha del empleado (RRHH → Personal). Vive aquí y no en
// TabDatos.tsx ("use client") porque la página de la ficha es del servidor y arma el valor inicial:
// una función de un módulo de cliente no se puede llamar desde el servidor (fue el error 2112229006
// al abrir el primer empleado, 2026-10-30).

export type Campos = Omit<Empleado, "id" | "perfil_id" | "foto_path" | "notas_hoja_vida" | "talla_camisa" | "talla_pantalon" | "talla_botas" | "salario_base" | "bonificacion" | "rodamiento"> & {
  salario_base: string;
  bonificacion: string;
  rodamiento: string;
};

export const FICHA_VACIA: Campos = {
  primer_nombre: "",
  otros_nombres: "",
  primer_apellido: "",
  segundo_apellido: "",
  tipo_documento: "CC",
  numero_documento: "",
  codigo_interno: "",
  titulacion: "",
  mostrar_titulacion_carnet: false,
  cargo: "",
  area: "",
  estado_laboral: "activo",
  correo: "",
  telefono: "",
  ciudad: "",
  direccion: "",
  municipio_dane: "",
  fecha_nacimiento: "",
  rh: "",
  eps: "",
  afp: "",
  arl: "",
  caja_compensacion: "",
  contacto_emergencia: "",
  telefono_emergencia: "",
  fecha_ingreso: "",
  fecha_retiro: "",
  motivo_retiro: "",
  salario_base: "",
  bonificacion: "",
  rodamiento: "",
  detalle_bonificacion: "",
  tipo_contrato: "indefinido",
  aplica_auxilio_transporte: true,
  salario_integral: false,
};

export function camposDe(e: Empleado): Campos {
  const s = (v: string | null) => v ?? "";
  const n = (v: number | null) => (v === null || v === undefined ? "" : String(Math.round(Number(v))));
  // Solo los campos de esta pestaña (no la foto, las tallas ni el usuario enlazado).
  const fila = e as unknown as Record<string, unknown>;
  return {
    ...FICHA_VACIA,
    ...Object.fromEntries(Object.keys(FICHA_VACIA).map((k) => [k, fila[k] === null || fila[k] === undefined ? "" : fila[k]])),
    titulacion: s(e.titulacion),
    tipo_contrato: s(e.tipo_contrato),
    salario_base: n(e.salario_base),
    bonificacion: n(e.bonificacion),
    rodamiento: n(e.rodamiento),
  } as Campos;
}
