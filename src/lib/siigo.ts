// Espejo de Siigo (migraciones 128 y 129): Contable y Financiero.
//
// REGLA DE ORO: SOLO LECTURA. Siigo es el registro legal (lo que se declara y firma la
// contadora). Ninguna pantalla escribe en las tablas siigo_*; la única excepción es siigo_config.
// La app no tiene el privilegio (129), pero tampoco hay que ofrecer el formulario.
//
// Sin "use client": lo usan páginas del servidor.

/** Fecha y hora de Bogotá para mostrar un corte. */
export function fechaHora(iso: string) {
  return new Date(iso).toLocaleString("es-CO", { timeZone: "America/Bogota", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

/** Cuántos días tiene un corte (0 = menos de 24 h). */
export function diasDesde(iso: string, ahora = Date.now()) {
  return Math.floor((ahora - new Date(iso).getTime()) / 86_400_000);
}

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
/** El mes 13 es el cierre contable, no un mes del calendario. */
export const nombreMes = (mes: number) => (mes === 13 ? "Cierre (13)" : (MESES[mes - 1] ?? String(mes)));

export const PERIODO_IVA: Record<string, string> = { bimestral: "bimestre", cuatrimestral: "cuatrimestre" };

/** Nivel de una cuenta del PUC por su largo: 1 clase, 2 grupo, 4 cuenta, 6 subcuenta, más = auxiliar. */
export function nivelCuenta(cuenta: string) {
  const n = cuenta.replace(/\D/g, "").length;
  return n <= 1 ? 0 : n <= 2 ? 1 : n <= 4 ? 2 : n <= 6 ? 3 : 4;
}

/** Comodín de subcuenta válido para siigo_config: dígitos, opcionalmente terminado en %. */
export const CUENTA_PUC = /^\d{1,10}%?$/;

export const formatoPesos = (v: number | string | null | undefined) =>
  v == null ? "—" : new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(Number(v));

type ClienteSupabase = Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>;
export type TablaSiigo = "siigo_terceros" | "siigo_facturas" | "siigo_balance" | "siigo_cuentas_por_pagar";

/**
 * El corte de una tabla del espejo: su sincronizado_en más reciente (null = nunca llegó nada).
 * Se pide aparte de lo filtrado, para no decir "falta conectar" cuando solo el filtro quedó vacío.
 */
export async function corteDe(supabase: ClienteSupabase, tabla: TablaSiigo): Promise<string | null> {
  const { data } = await supabase.from(tabla).select("sincronizado_en").order("sincronizado_en", { ascending: false }).limit(1);
  return (data?.[0] as { sincronizado_en: string } | undefined)?.sincronizado_en ?? null;
}

/** Año y mes pedidos por la URL; si no vienen, el último periodo que llegó (o el mes actual). */
export function periodoPedido(sp: Record<string, string | string[] | undefined>, ultimo: { anio: number; mes: number } | null) {
  const [anioHoy, mesHoy] = new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" }).split("-").map(Number);
  const anio = Number(sp.anio) || ultimo?.anio || anioHoy;
  const mesUrl = Number(sp.mes);
  const mes = mesUrl >= 1 && mesUrl <= 13 ? mesUrl : (ultimo?.mes ?? mesHoy);
  const anios = Array.from({ length: 6 }, (_, i) => anioHoy - i);
  if (!anios.includes(anio)) anios.push(anio);
  return { anio, mes, anios };
}
