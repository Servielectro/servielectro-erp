import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// Archivos huérfanos del bucket "visitas": carpetas {visita_id}/ cuya visita ya no existe en la
// base. Aparecen cuando se borran filas de la base a mano (2026-10-21: 5 archivos de una visita
// de prueba borrada). La app no las genera: las visitas no se borran (se cancelan) y las tareas
// no tienen archivos.
//
// Supabase no deja borrar archivos por SQL ("Direct deletion from storage tables is not
// allowed"): va por la API de Storage, con la clave de servicio, solo en el servidor. Quien
// llama tiene que haber verificado antes el permiso (configuracion/responsable).

const BUCKET = "visitas";
const PAGINA = 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface CarpetaHuerfana {
  visitaId: string;
  archivos: number;
  bytes: number;
}

type Admin = ReturnType<typeof createAdminClient>;

async function listarTodo(admin: Admin, prefijo: string) {
  const todo: { name: string; id: string | null; metadata: { size?: number } | null }[] = [];
  for (let offset = 0; ; offset += PAGINA) {
    const { data, error } = await admin.storage.from(BUCKET).list(prefijo, { limit: PAGINA, offset });
    if (error) throw new Error(`No se pudo listar el almacenamiento: ${error.message}`);
    todo.push(...((data ?? []) as typeof todo));
    if (!data || data.length < PAGINA) return todo;
  }
}

async function visitasQueExisten(admin: Admin, ids: string[]): Promise<Set<string>> {
  const existen = new Set<string>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await admin.from("visitas").select("id").in("id", ids.slice(i, i + 200));
    if (error) throw new Error(`No se pudo consultar las visitas: ${error.message}`);
    for (const v of data ?? []) existen.add(v.id as string);
  }
  return existen;
}

/** Carpetas del bucket cuya visita ya no existe, con cuántos archivos y cuánto pesan. */
export async function buscarHuerfanos(): Promise<CarpetaHuerfana[]> {
  const admin = createAdminClient();
  const raiz = await listarTodo(admin, "");
  // Las carpetas vienen sin id; solo cuentan las que se llaman como una visita.
  const carpetas = raiz.filter((e) => e.id === null && UUID.test(e.name)).map((e) => e.name);
  if (carpetas.length === 0) return [];
  const existen = await visitasQueExisten(admin, carpetas);
  const huerfanas: CarpetaHuerfana[] = [];
  for (const visitaId of carpetas.filter((c) => !existen.has(c))) {
    const archivos = (await listarTodo(admin, visitaId)).filter((a) => a.id !== null);
    if (archivos.length === 0) continue; // carpeta vacía: no ocupa nada
    huerfanas.push({
      visitaId,
      archivos: archivos.length,
      bytes: archivos.reduce((s, a) => s + (a.metadata?.size ?? 0), 0),
    });
  }
  return huerfanas;
}

export interface ResultadoBorrado {
  visitaId: string;
  borrados: number;
  /** null = quedó vacía. Si falló, por qué y cuántos archivos siguen ahí. */
  error: string | null;
  quedan: number;
}

/**
 * Borra las carpetas indicadas, una por una. Antes de cada una vuelve a comprobar que la
 * visita no existe (si apareció, no se toca). Después vuelve a listar: si algo quedó, lo
 * dice. Nunca deja un fallo en silencio.
 */
export async function borrarHuerfanos(visitaIds: string[]): Promise<ResultadoBorrado[]> {
  const admin = createAdminClient();
  const validos = visitaIds.filter((id) => UUID.test(id));
  const existen = await visitasQueExisten(admin, validos);
  const resultados: ResultadoBorrado[] = [];
  for (const visitaId of validos) {
    if (existen.has(visitaId)) {
      resultados.push({ visitaId, borrados: 0, quedan: 0, error: "La visita existe: no es huérfana y no se tocó." });
      continue;
    }
    try {
      const rutas = (await listarTodo(admin, visitaId)).filter((a) => a.id !== null).map((a) => `${visitaId}/${a.name}`);
      let borrados = 0;
      let error: string | null = null;
      for (let i = 0; i < rutas.length; i += PAGINA) {
        const { data, error: e } = await admin.storage.from(BUCKET).remove(rutas.slice(i, i + PAGINA));
        if (e) {
          error = e.message;
          break;
        }
        borrados += data?.length ?? 0;
      }
      const quedan = (await listarTodo(admin, visitaId)).filter((a) => a.id !== null).length;
      if (!error && quedan > 0) error = "El almacenamiento no borró todos los archivos.";
      resultados.push({ visitaId, borrados, quedan, error });
    } catch (e) {
      resultados.push({ visitaId, borrados: 0, quedan: -1, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return resultados;
}
