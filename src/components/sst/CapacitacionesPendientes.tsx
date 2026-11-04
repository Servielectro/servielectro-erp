import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { COLUMNAS_POR_FIRMAR, type PorFirmar } from "@/lib/sst/por-firmar";

/**
 * "Tienes una capacitación pendiente de firmar": los formatos a los que convocaron a este usuario
 * y que todavía no firmó (v_mis_documentos_por_firmar, migración 131: filtra sola por auth.uid()).
 * No depende del permiso de SG-SST: el técnico no lo tiene. Sin nada pendiente no pinta nada.
 */
export async function CapacitacionesPendientes() {
  const supabase = await createClient();
  const { data } = await supabase.from("v_mis_documentos_por_firmar").select(COLUMNAS_POR_FIRMAR).eq("ya_firme", false).order("fecha");
  const pendientes = (data ?? []) as PorFirmar[];
  if (!pendientes.length) return null;

  return (
    <section className="space-y-2 rounded-lg border-2 border-amber-500 bg-amber-50 p-3">
      <p className="text-base font-bold text-amber-900">
        {pendientes.length === 1 ? "Tienes un documento pendiente de firmar" : `Tienes ${pendientes.length} documentos pendientes de firmar`}
      </p>
      {pendientes.map((s) => (
        <Link
          key={s.formato_id}
          href={`/tecnico/por-firmar/${s.formato_id}`}
          className="flex min-h-12 items-center justify-between gap-2 rounded-md border border-amber-400 bg-white px-3 py-2 active:bg-amber-100"
        >
          <span>
            <span className="block font-semibold text-slate-900">{s.tema || s.formato}</span>
            <span className="block text-sm text-slate-600">
              {s.codigo} · {s.fecha} · {s.material_id ? "lee el material y firma" : "revisa y firma"}
            </span>
          </span>
          <span className="text-lg" aria-hidden>
            →
          </span>
        </Link>
      ))}
    </section>
  );
}
