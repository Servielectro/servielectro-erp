// "Vista" (migración 59): el técnico abrió la visita o vio la tarea. La oficina lo ve en la
// línea de tiempo (Recibida · Vista · Check-in · Check-out).
//
// Sin señal no se pierde: la marca queda pendiente en el celular y se manda al sincronizar.
// La hora la pone la base al recibirla (no el celular): si se abrió sin señal, la hora es la
// de la sincronización. Así nadie puede adelantar la hora desde el celular.
//
// Las funciones de la base solo marcan la fila propia y una vez: mandar de más no hace daño.

import { createClient } from "@/lib/supabase/client";

type Tipo = "visita" | "tarea";
interface Pendiente {
  tipo: Tipo;
  id: string;
}

const PENDIENTES = "se-vistas-pendientes";
const HECHAS = "se-vistas-hechas";
const MAX_HECHAS = 500;
const FUNCION: Record<Tipo, string> = { visita: "fn_marcar_visita_vista", tarea: "fn_marcar_tarea_vista" };

function leer<T>(clave: string): T[] {
  try {
    const v = JSON.parse(localStorage.getItem(clave) ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function escribir(clave: string, valor: unknown[]) {
  try {
    localStorage.setItem(clave, JSON.stringify(valor));
  } catch {
    // sin almacenamiento: la próxima vez que la abra se vuelve a intentar
  }
}

const llave = (p: Pendiente) => `${p.tipo}:${p.id}`;

/** Marca como vista (si no se marcó ya en este celular) e intenta mandarla ya. */
export function marcarVista(tipo: Tipo, id: string) {
  const p = { tipo, id };
  if (leer<string>(HECHAS).includes(llave(p))) return;
  const pendientes = leer<Pendiente>(PENDIENTES);
  if (!pendientes.some((x) => llave(x) === llave(p))) {
    pendientes.push(p);
    escribir(PENDIENTES, pendientes);
  }
  void enviarVistas();
}

let enviando = false;

/** Manda las marcas pendientes. Sin señal, o si la base no responde, quedan para después. */
export async function enviarVistas() {
  if (enviando || typeof navigator === "undefined" || !navigator.onLine) return;
  enviando = true;
  try {
    const supabase = createClient();
    for (const p of leer<Pendiente>(PENDIENTES)) {
      const { error } = await supabase.rpc(FUNCION[p.tipo], p.tipo === "visita" ? { p_visita_id: p.id } : { p_tarea_id: p.id });
      if (error) break; // sin red, sesión vencida o la base sin la migración 59: se reintenta después
      escribir(PENDIENTES, leer<Pendiente>(PENDIENTES).filter((x) => llave(x) !== llave(p)));
      escribir(HECHAS, [...leer<string>(HECHAS), llave(p)].slice(-MAX_HECHAS));
    }
  } finally {
    enviando = false;
  }
}
