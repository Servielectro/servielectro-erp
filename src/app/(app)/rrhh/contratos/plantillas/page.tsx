import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { MarcoRrhh } from "@/components/rrhh/FiltrosRrhh";
import { EditorContrato } from "@/components/rrhh/EditorContrato";
import { TIPO_CONTRATO, type Actividad, type Clausula, type Poliza } from "@/lib/contratos";

const TIPOS = ["termino_fijo", "indefinido", "obra_labor", "prestacion_servicios"];

// Plantillas por tipo de contrato: "Solo valores base · no es el contrato". Nacieron con los
// títulos de NEXGO y el texto vacío; Jhojan transcribe acá el texto revisado por su abogado.
// Cambiar una plantilla no cambia los contratos ya hechos (cada uno copió la suya).
export default async function PlantillasContratoPage({ searchParams }: { searchParams: Promise<{ tipo?: string }> }) {
  const { tipo: tipoParam } = await searchParams;
  const tipo = TIPOS.includes(tipoParam ?? "") ? tipoParam! : "termino_fijo";
  const supabase = await createClient();
  const { data: veTodo } = await supabase.rpc("fn_rrhh_ve_todo");
  if (veTodo !== true) {
    return (
      <MarcoRrhh titulo="Plantillas de contrato">
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">Las plantillas requieren RRHH en nivel “trabajar”.</p>
      </MarcoRrhh>
    );
  }
  const { data: plantilla } = await supabase.from("contrato_plantillas").select("id, nombre").eq("tipo", tipo).eq("activa", true).order("created_at").limit(1).maybeSingle();
  const [cl, po, cr] = plantilla
    ? await Promise.all([
        supabase.from("contrato_plantilla_clausulas").select("id, orden, titulo, texto").eq("plantilla_id", plantilla.id).order("orden"),
        supabase.from("contrato_plantilla_polizas").select("id, orden, activo, poliza, porcentaje, durante_anios, meses_extra, complemento").eq("plantilla_id", plantilla.id).order("orden"),
        supabase.from("contrato_plantilla_cronograma").select("id, orden, actividad, dia_inicio, duracion_habiles, responsable").eq("plantilla_id", plantilla.id).order("orden"),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }];

  return (
    <MarcoRrhh titulo="Plantillas de contrato" ayuda="Solo valores base · no es el contrato. Lo que cambie acá lo toman los contratos que se generen después.">
      <Link href="/rrhh/contratos" className="mb-2 inline-flex min-h-9 items-center text-xs font-semibold text-slate-600">
        ← Contratos
      </Link>
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {TIPOS.map((t) => (
          <Link
            key={t}
            href={`/rrhh/contratos/plantillas?tipo=${t}`}
            className={`flex min-h-9 items-center justify-center rounded-md border px-2 text-center text-xs font-semibold ${
              t === tipo ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700"
            }`}
          >
            {TIPO_CONTRATO[t]}
          </Link>
        ))}
      </div>
      {!plantilla ? (
        <p className="text-sm text-slate-500">No hay plantilla activa para este tipo.</p>
      ) : (
        <EditorContrato
          de="plantilla"
          id={plantilla.id}
          clausulas={(cl.data ?? []) as Clausula[]}
          polizas={(po.data ?? []) as Poliza[]}
          cronograma={(cr.data ?? []) as Actividad[]}
          editable
        />
      )}
    </MarcoRrhh>
  );
}
