import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ESTADO_FORMATO } from "@/lib/sst/plantillas";

interface Fila {
  id: string;
  fecha: string;
  tema: string | null;
  hora: string | null;
  lugar: string | null;
  dirigida_por: string | null;
  estado: string;
  participantes: number;
  firmo_capacitador: boolean;
}

// FOR-02: cada sesión de capacitación o inducción con sus firmas (v_sst_capacitaciones).
export default async function CapacitacionesPage() {
  const supabase = await createClient();
  const [{ data, error }, nivelRes] = await Promise.all([
    supabase
      .from("v_sst_capacitaciones")
      .select("id, fecha, tema, hora, lugar, dirigida_por, estado, participantes, firmo_capacitador")
      .order("fecha", { ascending: false })
      .order("creado_en", { ascending: false })
      .limit(200),
    // Devuelve el nivel (consultar / trabajar / responsable) o null; no es booleano.
    supabase.rpc("fn_permiso_seccion", { p_modulo: "sgsst", p_seccion: "capacitaciones" }),
  ]);
  const nivel = nivelRes.data as string | null;
  const trabaja = nivel === "trabajar" || nivel === "responsable";
  const filas = (data ?? []) as Fila[];
  return (
    <div className="mx-auto w-full max-w-3xl flex-1 space-y-3 p-4 sm:p-6">
      <Link href="/sgsst" className="text-sm text-slate-600 underline">
        ← SG-SST
      </Link>
      <h1 className="text-lg font-bold text-slate-900">Capacitaciones e inducción</h1>
      {trabaja && (
        <Link href="/sgsst/capacitaciones/nueva" className="flex min-h-14 items-center justify-center rounded-xl bg-slate-900 px-4 text-lg font-semibold text-white">
          Nueva capacitación
        </Link>
      )}
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">No se pudo leer el listado: {error.message}</p>}
      {!error && filas.length === 0 && <p className="text-sm text-slate-600">Todavía no hay capacitaciones registradas.</p>}
      <ul className="space-y-2">
        {filas.map((f) => (
          <li key={f.id}>
            <Link href={`/sgsst/capacitaciones/${f.id}`} className="block rounded-xl border border-slate-300 p-3 active:bg-slate-50">
              <p className="font-semibold text-slate-900">{f.tema || "(sin tema)"}</p>
              <p className="text-sm text-slate-600">
                {f.fecha}
                {f.hora ? ` · ${f.hora}` : ""}
                {f.lugar ? ` · ${f.lugar}` : ""}
              </p>
              <p className="mt-1 text-sm text-slate-700">
                {ESTADO_FORMATO[f.estado] ?? f.estado} · {f.participantes} participante{Number(f.participantes) === 1 ? "" : "s"} ·{" "}
                {f.firmo_capacitador ? "firmó el capacitador" : "falta el capacitador"}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
