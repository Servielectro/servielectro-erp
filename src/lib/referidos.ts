// Referenciados (migración 127): agentes comerciales externos y su comisión.
// Sin "use client": lo leen páginas del servidor y componentes del navegador.

export type CategoriaReferido = "freelance" | "empresa_seguridad" | "administrador_ph" | "instalador" | "arquitecto_constructor" | "otro";
export const CATEGORIAS: { key: CategoriaReferido; label: string }[] = [
  { key: "freelance", label: "Freelance" },
  { key: "empresa_seguridad", label: "Empresa de seguridad privada" },
  { key: "administrador_ph", label: "Administrador de PH" },
  { key: "instalador", label: "Instalador" },
  { key: "arquitecto_constructor", label: "Arquitecto o constructor" },
  { key: "otro", label: "Otro" },
];
export const ETIQUETA_CATEGORIA: Record<string, string> = Object.fromEntries(CATEGORIAS.map((c) => [c.key, c.label]));

export interface Plan {
  id: string;
  nombre: string;
  descripcion: string | null;
  base: "utilidad" | "precio_con_comision";
  porcentaje: number;
  porcentaje_recurrente: number | null;
  meses_recurrencia: number | null;
  tope_por_proyecto: number | null;
  dias_vigencia_registro: number;
  causa: "recaudo" | "firma";
  activo: boolean;
}

export const ETIQUETA_BASE: Record<Plan["base"], string> = {
  precio_con_comision: "preciada dentro de la cotización",
  utilidad: "sobre la utilidad del proyecto",
};

export const ESTADO_REGISTRO: Record<string, { label: string; clase: string }> = {
  vigente: { label: "Vigente", clase: "bg-green-100 text-green-900" },
  ganado: { label: "Ganado", clase: "bg-blue-100 text-blue-900" },
  perdido: { label: "Perdido", clase: "bg-slate-200 text-slate-600" },
  vencido: { label: "Vencido", clase: "bg-amber-100 text-amber-900" },
};

export const ESTADO_COMISION: Record<string, { label: string; ayuda: string; clase: string }> = {
  causada: { label: "Causada", ayuda: "El cliente pagó: se debe, falta aprobarla", clase: "bg-amber-100 text-amber-900" },
  aprobada: { label: "Aprobada", ayuda: "Revisada: lista para pagar", clase: "bg-blue-100 text-blue-900" },
  pagada: { label: "Pagada", ayuda: "Ya se le giró al referido", clase: "bg-green-100 text-green-900" },
  anulada: { label: "Anulada", ayuda: "No se paga (con motivo)", clase: "bg-slate-200 text-slate-600" },
};

export const pct = (v: number | null | undefined) =>
  v == null ? "—" : `${(Number(v) * 100).toLocaleString("es-CO", { maximumFractionDigits: 2 })}%`;

/** Días que le quedan a un registro; negativo = vencido. */
export function textoDias(dias: number) {
  if (dias < 0) return { texto: `Venció hace ${-dias} día${dias === -1 ? "" : "s"}`, clase: "text-red-700" };
  if (dias === 0) return { texto: "Vence hoy", clase: "text-red-700" };
  if (dias <= 15) return { texto: `Quedan ${dias} días`, clase: "text-amber-700" };
  return { texto: `Quedan ${dias} días`, clase: "text-slate-600" };
}

export const soloDigitos = (nit: string) => nit.split("-")[0].replace(/\D/g, "");

export function sumarDias(fecha: string, dias: number) {
  const d = new Date(`${fecha}T12:00:00`);
  d.setDate(d.getDate() + dias);
  return d.toLocaleDateString("en-CA");
}
