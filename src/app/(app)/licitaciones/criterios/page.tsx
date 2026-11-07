import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { EditorCriterios, type Criterio } from "./EditorCriterios";

// Qué busca el radar (licitacion_criterios). Quien trabaja la sección agrega palabras, ciudades,
// departamentos y modalidades, y activa o desactiva cualquiera. No se borra nada: se desactiva
// (queda la historia). Las reglas las pone la base (migración 143): una palabra va en una sola
// línea, y una ubicación es para todas las líneas.
export default async function CriteriosPage() {
  const supabase = await createClient();
  const [critRes, nivelRes] = await Promise.all([
    supabase
      .from("licitacion_criterios")
      .select("id, tipo, nombre, valor, linea, activo, nota, creado_en")
      .order("tipo")
      .order("linea", { nullsFirst: true })
      .order("valor"),
    // Devuelve el nivel (consultar / trabajar / responsable) o null; no es booleano.
    supabase.rpc("fn_permiso_seccion", { p_modulo: "licitaciones", p_seccion: "criterios" }),
  ]);
  const nivel = nivelRes.data as string | null;
  return (
    <div className="mx-auto w-full max-w-3xl flex-1 space-y-4 p-4 sm:p-6">
      <Link href="/licitaciones" className="text-sm text-slate-600 underline">
        ← Licitaciones
      </Link>
      <h1 className="text-lg font-bold text-slate-900">Qué estamos buscando</h1>
      <p className="text-sm text-slate-600">
        Un proceso es <b>relevante</b> cuando calza con nuestra <b>actividad</b> (un código o una palabra), está en una de nuestras{" "}
        <b>ciudades o departamentos</b>, y cumple 4 de los 5 criterios. Lo que no tiene ninguna fila activa cuenta como cumplido.
      </p>
      {critRes.error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">No se pudieron leer los criterios: {critRes.error.message}</p>
      ) : (
        <EditorCriterios
          criterios={(critRes.data ?? []) as Criterio[]}
          puedeEditar={nivel === "trabajar" || nivel === "responsable"}
          puedeRecalcular={nivel === "responsable"}
        />
      )}
    </div>
  );
}
