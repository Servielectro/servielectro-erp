// Cierre de sesión por inactividad — piezas compartidas entre el contador
// (CierrePorInactividad), la pantalla de Configuración y /login.
//
// Es seguridad de pantalla (tablet olvidada en obra con la sesión abierta), no
// control de acceso: la RLS de Supabase sigue siendo la que decide qué datos se ven.
//
// El tiempo es por dispositivo (localStorage), a propósito: la idea es poder tener
// 10 minutos en la tablet de mostrador y 60 en el computador de la oficina.

export const MINUTOS_INACTIVIDAD_DEFAULT = 20;
export const OPCIONES_MINUTOS_INACTIVIDAD = [5, 10, 15, 20, 30, 45, 60, 90, 120];
// El aviso aparece este tiempo antes del cierre (con 20 min: a los 19).
export const AVISO_ANTES_MS = 60_000;

const CLAVE_MINUTOS = "se-erp:inactividad-minutos";
// Última interacción real, compartida entre pestañas del mismo navegador.
const CLAVE_ULTIMA_ACTIVIDAD = "se-erp:ultima-actividad";

export function leerMinutosInactividad(): number {
  try {
    const n = Number(window.localStorage.getItem(CLAVE_MINUTOS));
    // Solo valores de la lista: nadie puede dejar la sesión abierta un día entero
    // editando localStorage a mano.
    if (OPCIONES_MINUTOS_INACTIVIDAD.includes(n)) return n;
  } catch {}
  return MINUTOS_INACTIVIDAD_DEFAULT;
}

export function guardarMinutosInactividad(minutos: number) {
  try {
    window.localStorage.setItem(CLAVE_MINUTOS, String(minutos));
  } catch {}
}

export function leerUltimaActividad(): number | null {
  try {
    const n = Number(window.localStorage.getItem(CLAVE_ULTIMA_ACTIVIDAD));
    return n > 0 ? n : null;
  } catch {
    return null;
  }
}

export function guardarUltimaActividad(ts: number) {
  try {
    window.localStorage.setItem(CLAVE_ULTIMA_ACTIVIDAD, String(ts));
  } catch {}
}

// Se llama al llegar a /login: un inicio de sesión nuevo arranca con el contador
// en cero, no hereda la marca vieja de la sesión anterior.
export function reiniciarUltimaActividad() {
  try {
    window.localStorage.removeItem(CLAVE_ULTIMA_ACTIVIDAD);
  } catch {}
}

// Destino de vuelta después del login: solo rutas internas de la app
// (evita que ?next=//sitio-externo.com sirva de redirección abierta).
export function destinoSeguro(next: unknown): string {
  if (
    typeof next === "string" &&
    next.startsWith("/") &&
    !next.startsWith("//") &&
    !next.startsWith("/\\") &&
    !next.startsWith("/login")
  ) {
    return next;
  }
  return "/";
}
