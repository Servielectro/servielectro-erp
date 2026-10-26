// Filtros del CRM (pedido de Jhojan, 2026-10-25, sobre el modelo de NEXGO). Todo vive en la
// URL: se comparte el enlace y se ve lo mismo, y el botón "atrás" deshace un filtro.
// Funciones puras: las usa la página (servidor) y se prueban sin base.

import type { EstadoOportunidad } from "@/lib/crm";

/**
 * Los 8 estados comerciales de NEXGO. Nuestro pipeline tiene más etapas; cada estado agrupa las
 * suyas. Los contadores de arriba SON el filtro.
 */
export type GrupoComercial = "prospecto" | "contactado" | "cotizado" | "negociacion" | "ganado" | "cliente" | "perdido" | "inactivo";
export const GRUPOS: { id: GrupoComercial; nombre: string; ayuda: string }[] = [
  { id: "prospecto", nombre: "Prospectos", ayuda: "Llegó la solicitud o se acerca una renovación; todavía no se ha hablado a fondo." },
  { id: "contactado", nombre: "Contactados", ayuda: "Ya hubo visita técnica o se está decidiendo si se cotiza (Go / No-Go)." },
  { id: "cotizado", nombre: "Cotizados", ayuda: "La cotización se está haciendo o ya se envió." },
  { id: "negociacion", nombre: "En negociación", ayuda: "Sustentación, negociación, instancia de decisión o legalización." },
  { id: "ganado", nombre: "Ganados", ayuda: "Ganado o renovado, pero todavía no se volvió proyecto." },
  { id: "cliente", nombre: "Clientes", ayuda: "Ganado y ya convertido en proyecto: es cliente activo." },
  { id: "perdido", nombre: "Perdidos", ayuda: "Perdido o no renovado (con su motivo)." },
  { id: "inactivo", nombre: "Inactivos", ayuda: "Aplazados: hay una fecha para retomarlos." },
];
export const NOMBRE_GRUPO = Object.fromEntries(GRUPOS.map((g) => [g.id, g.nombre])) as Record<GrupoComercial, string>;

const ETAPA_GRUPO: Record<string, GrupoComercial> = {
  solicitud: "prospecto",
  renovacion_proxima: "prospecto",
  visita_tecnica: "contactado",
  go_no_go: "contactado",
  cotizacion_elaboracion: "cotizado",
  cotizacion_enviada: "cotizado",
  renovacion_propuesta_enviada: "cotizado",
  sustentacion_negociacion: "negociacion",
  instancia_decision: "negociacion",
  aprobada_legalizacion: "negociacion",
  renovacion_en_aprobacion: "negociacion",
};

export function grupoDe(o: { etapaId: string; estado: EstadoOportunidad; resultado: "ganada" | "perdida" | null; proyectoId: string | null }): GrupoComercial {
  if (o.estado === "aplazada") return "inactivo";
  if (o.resultado === "perdida") return "perdido";
  if (o.resultado === "ganada") return o.proyectoId ? "cliente" : "ganado";
  return ETAPA_GRUPO[o.etapaId] ?? "negociacion";
}

/** De dónde llegó el negocio (la lista de la migración 74). */
export const ORIGENES: { id: string; nombre: string }[] = [
  { id: "referido", nombre: "Referido" },
  { id: "cliente_actual", nombre: "Cliente actual" },
  { id: "llamada_entrante", nombre: "Llamada entrante" },
  { id: "pagina_web", nombre: "Página web" },
  { id: "redes_sociales", nombre: "Redes sociales" },
  { id: "whatsapp", nombre: "WhatsApp" },
  { id: "visita_comercial", nombre: "Visita comercial" },
  { id: "licitacion", nombre: "Licitación" },
  { id: "aliado", nombre: "Aliado / referidor" },
  { id: "otro", nombre: "Otro" },
];
export const NOMBRE_ORIGEN = Object.fromEntries(ORIGENES.map((o) => [o.id, o.nombre])) as Record<string, string>;

export type CampoFecha = "creacion" | "cierre" | "actividad";
export const CAMPOS_FECHA: { id: CampoFecha; nombre: string }[] = [
  { id: "creacion", nombre: "Creación del negocio" },
  { id: "cierre", nombre: "Objetivo de cierre" },
  { id: "actividad", nombre: "Última actividad" },
];
export type Atajo = "este_mes" | "mes_pasado" | "ult7" | "este_anio";
export const ATAJOS: { id: Atajo; nombre: string }[] = [
  { id: "ult7", nombre: "Últimos 7 días" },
  { id: "este_mes", nombre: "Este mes" },
  { id: "mes_pasado", nombre: "Mes pasado" },
  { id: "este_anio", nombre: "Este año" },
];

/** Desde/hasta (YYYY-MM-DD, inclusivos) de un atajo, contado desde hoy en Colombia. */
export function rangoDeAtajo(atajo: Atajo, hoy: string): { desde: string; hasta: string } {
  const [a, m, d] = hoy.split("-").map(Number);
  const iso = (y: number, mes: number, dia: number) => new Date(Date.UTC(y, mes - 1, dia)).toISOString().slice(0, 10);
  switch (atajo) {
    case "ult7":
      return { desde: iso(a, m, d - 6), hasta: hoy };
    case "este_mes":
      return { desde: iso(a, m, 1), hasta: iso(a, m + 1, 0) };
    case "mes_pasado":
      return { desde: iso(a, m - 1, 1), hasta: iso(a, m, 0) };
    case "este_anio":
      return { desde: iso(a, 1, 1), hasta: iso(a, 12, 31) };
  }
}

export interface FiltrosCrm {
  grupo: GrupoComercial | null;
  valorMin: number | null;
  valorMax: number | null;
  campoFecha: CampoFecha;
  atajo: Atajo | null;
  desde: string | null;
  hasta: string | null;
  cliente: string | null;
  responsable: string | null;
  origen: string | null;
  vencidos: boolean;
  sinMovimiento: number | null;
}

type Params = Record<string, string | string[] | undefined>;
const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || null;
const numero = (v: string | null) => {
  if (!v) return null;
  const n = Number(v.replace(/[^\d]/g, ""));
  return Number.isFinite(n) && v.replace(/[^\d]/g, "") !== "" ? n : null;
};
const fechaValida = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

export function leerFiltros(p: Params): FiltrosCrm {
  const grupo = uno(p.e);
  const campo = uno(p.fd);
  const atajo = uno(p.r);
  const sm = numero(uno(p.sm));
  return {
    grupo: GRUPOS.some((g) => g.id === grupo) ? (grupo as GrupoComercial) : null,
    valorMin: numero(uno(p.vmin)),
    valorMax: numero(uno(p.vmax)),
    campoFecha: CAMPOS_FECHA.some((c) => c.id === campo) ? (campo as CampoFecha) : "creacion",
    atajo: ATAJOS.some((a) => a.id === atajo) ? (atajo as Atajo) : null,
    desde: fechaValida(uno(p.desde)),
    hasta: fechaValida(uno(p.hasta)),
    cliente: uno(p.cli),
    responsable: uno(p.resp),
    origen: uno(p.org),
    vencidos: uno(p.venc) === "1",
    sinMovimiento: sm && sm > 0 ? sm : null,
  };
}

/** Los filtros (además del pipeline) a la URL; los vacíos no se escriben. */
export function aParams(f: Partial<FiltrosCrm>, base: Record<string, string> = {}): URLSearchParams {
  const q = new URLSearchParams(base);
  if (f.grupo) q.set("e", f.grupo);
  if (f.valorMin !== null && f.valorMin !== undefined) q.set("vmin", String(f.valorMin));
  if (f.valorMax !== null && f.valorMax !== undefined) q.set("vmax", String(f.valorMax));
  const hayFecha = !!(f.atajo || f.desde || f.hasta);
  if (hayFecha && f.campoFecha && f.campoFecha !== "creacion") q.set("fd", f.campoFecha);
  if (f.atajo) q.set("r", f.atajo);
  else {
    if (f.desde) q.set("desde", f.desde);
    if (f.hasta) q.set("hasta", f.hasta);
  }
  if (f.cliente) q.set("cli", f.cliente);
  if (f.responsable) q.set("resp", f.responsable);
  if (f.origen) q.set("org", f.origen);
  if (f.vencidos) q.set("venc", "1");
  if (f.sinMovimiento) q.set("sm", String(f.sinMovimiento));
  return q;
}

export function hayFiltros(f: FiltrosCrm): boolean {
  return !!(f.grupo || f.valorMin !== null || f.valorMax !== null || f.atajo || f.desde || f.hasta || f.cliente || f.responsable || f.origen || f.vencidos || f.sinMovimiento);
}

/** Lo que el filtro necesita de cada negocio. */
export interface FilaCrm {
  id: string;
  nombre: string;
  clienteId: string;
  clienteNombre: string;
  etapaId: string;
  etapaNombre: string;
  estado: EstadoOportunidad;
  grupo: GrupoComercial;
  valor: number | null;
  valorEsCotizado: boolean;
  creado: string; // YYYY-MM-DD
  objetivoCierre: string | null;
  ultimaActividad: string; // YYYY-MM-DD
  responsableId: string | null;
  origen: string | null;
  abierta: boolean;
}

export function diasEntre(desde: string, hasta: string): number {
  return Math.round((Date.parse(hasta + "T00:00:00Z") - Date.parse(desde + "T00:00:00Z")) / 86_400_000);
}

/**
 * Aplica todos los filtros menos `excepto` (los contadores se cuentan con los demás filtros
 * puestos, para que el número de cada estado diga cuántos hay con lo demás que elegiste).
 */
export function filtrar(filas: FilaCrm[], f: FiltrosCrm, hoy: string, excepto?: "grupo"): FilaCrm[] {
  const rango = f.atajo ? rangoDeAtajo(f.atajo, hoy) : { desde: f.desde, hasta: f.hasta };
  return filas.filter((o) => {
    if (excepto !== "grupo" && f.grupo && o.grupo !== f.grupo) return false;
    if (f.valorMin !== null && (o.valor ?? 0) < f.valorMin) return false;
    if (f.valorMax !== null && (o.valor === null || o.valor > f.valorMax)) return false;
    if (rango.desde || rango.hasta) {
      const fecha = f.campoFecha === "cierre" ? o.objetivoCierre : f.campoFecha === "actividad" ? o.ultimaActividad : o.creado;
      if (!fecha) return false;
      if (rango.desde && fecha < rango.desde) return false;
      if (rango.hasta && fecha > rango.hasta) return false;
    }
    if (f.cliente && o.clienteId !== f.cliente) return false;
    if (f.responsable && o.responsableId !== f.responsable) return false;
    if (f.origen && (f.origen === "sin" ? o.origen !== null : o.origen !== f.origen)) return false;
    if (f.vencidos && !(o.abierta && o.objetivoCierre !== null && o.objetivoCierre < hoy)) return false;
    if (f.sinMovimiento && !(o.abierta && diasEntre(o.ultimaActividad, hoy) >= f.sinMovimiento)) return false;
    return true;
  });
}
