import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

interface Equipo {
  id: string;
  codigo: string;
  clase: string;
  marca: string | null;
  referencia: string | null;
  serial: string | null;
  norma: string | null;
  estado: string;
  confiabilidad: string;
  periodicidad_inspeccion_meses: number;
  ultima_inspeccion: string | null;
  ultimo_resultado: string | null;
  proxima_inspeccion: string | null;
  fin_vida_util: string | null;
  vigente_hoy: boolean | null;
  archivos: number;
  notas: string | null;
}

const CONFIABILIDAD: Record<string, string> = {
  confirmada: "Datos confirmados con el documento",
  informada: "Datos informados, sin confirmar con el documento",
  inferida: "Datos inferidos",
  pendiente: "Datos pendientes",
};

/**
 * Hojas de vida de los equipos (migraciones 109 y 114): solo lectura por ahora. Es a donde lleva el
 * aviso de "inspección de equipo" del motor de vencimientos. La vigencia "hoy" la calcula la base
 * (fn_sst_equipo_vigente): sin inspección registrada, no está vigente.
 */
export default async function EquiposPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("v_sst_equipos").select("*").order("codigo");
  const equipos = (data ?? []) as Equipo[];
  return (
    <div className="mx-auto w-full max-w-3xl flex-1 space-y-3 p-4 sm:p-6">
      <Link href="/sgsst" className="text-sm text-slate-600 underline">
        ← SG-SST
      </Link>
      <div>
        <h1 className="text-lg font-bold text-slate-900">Equipos de protección contra caídas</h1>
        <p className="text-sm text-slate-600">La hoja de vida de cada equipo: referencia, serial, inspecciones y si está vigente.</p>
      </div>
      {error ? (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">No se pudieron leer los equipos: {error.message}</p>
      ) : equipos.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-600">No hay equipos registrados.</p>
      ) : (
        <ul className="space-y-2">
          {equipos.map((e) => (
            <li key={e.id} className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
              <div className="flex flex-wrap items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-900">
                    {e.codigo} · {e.clase.replace(/_/g, " ")}
                    {e.referencia ? ` · ${e.referencia}` : ""}
                  </p>
                  <p className="text-xs text-slate-600">
                    {[e.marca, e.serial && `serial ${e.serial}`, e.norma].filter(Boolean).join(" · ") || "Sin marca, serial ni norma registrados"}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${e.vigente_hoy ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}
                >
                  {e.vigente_hoy ? "Vigente hoy" : "No vigente hoy"}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-700">
                {e.ultima_inspeccion ? `Última inspección ${e.ultima_inspeccion} (${(e.ultimo_resultado ?? "").replace(/_/g, " ")})` : "Sin inspección registrada"}
                {e.proxima_inspeccion ? ` · próxima ${e.proxima_inspeccion}` : ""} · cada {e.periodicidad_inspeccion_meses} meses
                {e.fin_vida_util ? ` · vida útil hasta ${e.fin_vida_util}` : ""}
              </p>
              <p className="text-xs text-slate-500">
                {CONFIABILIDAD[e.confiabilidad] ?? e.confiabilidad} · {e.archivos} archivo{e.archivos === 1 ? "" : "s"}
                {e.estado !== "activo" ? ` · ${e.estado.replace(/_/g, " ")}` : ""}
              </p>
              {e.notas && <p className="mt-1 text-xs text-slate-600">{e.notas}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
