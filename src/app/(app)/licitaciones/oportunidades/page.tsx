import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { type Barrido, type FilaRadar, fechaCierre } from "@/lib/licitaciones/radar";
import { ListaRadar } from "./ListaRadar";

const CAMPOS =
  "id, id_del_proceso, entidad, departamento, ciudad, objeto, modalidad, presupuesto, cierra_en, url_secop, publicado_en, traida_en, " +
  "dias_publicado_al_traer, requiere_rup, afinidad, criterios_que_coinciden, criterios_faltantes, actividad_por, lineas_que_calzaron, relevante";

// Oportunidades: lo que trajo el radar de SECOP II y sigue abierto. Todo viene calculado de
// v_licitaciones_radar (migración 143): aquí no se decide nada. Sin datos de relleno: si el
// barrido trajo tres, se ven tres; si no hay nada, se dice por qué.
export default async function OportunidadesPage() {
  const supabase = await createClient();
  const [radarRes, actividadRes, barridoRes] = await Promise.all([
    // Solo lo que vino del radar: las filas cargadas a mano (la de la Policía) son seguimiento.
    supabase.from("v_licitaciones_radar").select(CAMPOS).neq("origen", "manual").limit(5000),
    supabase.from("licitacion_criterios").select("id", { count: "exact", head: true }).eq("activo", true).in("tipo", ["categoria", "palabra"]),
    supabase
      .from("licitacion_barridos")
      .select("id, iniciado_en, terminado_en, ventana_desde, leidos, con_actividad, relevantes, nuevos, sin_rup, con_token, error")
      .order("iniciado_en", { ascending: false })
      .limit(1),
  ]);
  const ahora = new Date();
  const todas = ((radarRes.data ?? []) as unknown as FilaRadar[])
    // Abiertas: sin fecha de cierre (SECOP no la trae) o que todavía no cierran.
    .filter((f) => {
      const c = fechaCierre(f.cierra_en);
      return !c || c.getTime() >= ahora.getTime();
    })
    // Lo relevante arriba; entre iguales, lo que cierra primero (sin fecha, al final).
    .sort((a, b) => {
      const r = Number(!!b.relevante) - Number(!!a.relevante);
      if (r) return r;
      const ca = fechaCierre(a.cierra_en)?.getTime() ?? Infinity;
      const cb = fechaCierre(b.cierra_en)?.getTime() ?? Infinity;
      return ca - cb;
    });
  const ultimo = (barridoRes.data?.[0] ?? null) as Barrido | null;
  const sinCriterios = (actividadRes.count ?? 0) === 0;

  // Por qué está vacía, en el orden en que se revisa.
  let vacia: { titulo: string; texto: string; enlace?: { href: string; texto: string } } | null = null;
  if (todas.length === 0) {
    if (sinCriterios)
      vacia = {
        titulo: "No hay criterios de actividad activos",
        texto: "Sin palabras ni códigos UNSPSC activos el radar no sabe qué buscar (y la base no deja correr el barrido: traería todo SECOP).",
        enlace: { href: "/licitaciones/criterios", texto: "Ir a los criterios" },
      };
    else if (!ultimo)
      vacia = {
        titulo: "Todavía no ha corrido ninguna búsqueda",
        texto: "Los criterios están listos, pero el radar aún no ha bajado nada de SECOP II. La lista se llena con la primera búsqueda.",
        enlace: { href: "/licitaciones/barridos", texto: "Ver el historial de búsqueda" },
      };
    else if (ultimo.error)
      vacia = {
        titulo: "La última búsqueda falló",
        texto: ultimo.error,
        enlace: { href: "/licitaciones/barridos", texto: "Ver el historial de búsqueda" },
      };
    else if (!ultimo.terminado_en)
      vacia = { titulo: "La búsqueda está corriendo", texto: "Vuelva en un par de minutos." };
    else
      vacia = {
        titulo: "Nada calzó",
        texto:
          `La última búsqueda leyó ${ultimo.leidos.toLocaleString("es-CO")} procesos abiertos de SECOP II y ` +
          `${ultimo.con_actividad === 0 ? "ninguno calzó con nuestras palabras o códigos" : `${ultimo.con_actividad} calzaron con la actividad, pero ya cerraron`}.`,
        enlace: { href: "/licitaciones/criterios", texto: "Revisar los criterios" },
      };
  }

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 space-y-4 p-4 sm:p-6 lg:max-w-6xl">
      <Link href="/licitaciones" className="text-sm text-slate-600 underline">
        ← Licitaciones
      </Link>
      <h1 className="text-lg font-bold text-slate-900">Oportunidades</h1>
      {radarRes.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">No se pudo leer el radar: {radarRes.error.message}</p>}
      {vacia ? (
        <div className="rounded-lg border border-slate-300 bg-white p-5 text-center">
          <p className="text-base font-semibold text-slate-900">{vacia.titulo}</p>
          <p className="mt-1 text-sm text-slate-600">{vacia.texto}</p>
          {vacia.enlace && (
            <Link href={vacia.enlace.href} className="mt-3 inline-block text-sm font-semibold text-brand-navy underline">
              {vacia.enlace.texto}
            </Link>
          )}
        </div>
      ) : (
        <ListaRadar filas={todas} ahoraIso={ahora.toISOString()} ultimo={ultimo} />
      )}
    </div>
  );
}
