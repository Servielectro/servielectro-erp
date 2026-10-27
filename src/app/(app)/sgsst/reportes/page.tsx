import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { tienePermiso } from "@/lib/permisos";
import { AtenderReporte, type ReporteGestion } from "./AtenderReporte";

const FILTROS = [
  { id: "abiertos", nombre: "Por atender", estados: ["nuevo", "en_gestion"] },
  { id: "cerrados", nombre: "Cerrados", estados: ["cerrado", "anulado"] },
];

export default async function ReportesPage({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  const { ver } = await searchParams;
  const filtro = FILTROS.find((f) => f.id === ver) ?? FILTROS[0];
  const supabase = await createClient();
  const [{ data, error }, fotosRes, personalRes, trabaja] = await Promise.all([
    supabase
      .from("sst_reportes_inseguros")
      .select("id, tipo, descripcion, lugar, lat, lng, gps_estado, reportado_por, reportado_en, observado_en_dispositivo, estado, accion_tomada, motivo_anulacion, atendido_en")
      .in("estado", filtro.estados)
      .order("reportado_en", { ascending: false })
      .limit(200),
    supabase.from("sst_reporte_fotos").select("reporte_id, path"),
    supabase.rpc("fn_sst_personal"),
    tienePermiso("sgsst", "trabajar"),
  ]);
  const nombres = new Map(((personalRes.data ?? []) as { perfil_id: string | null; nombre: string }[]).filter((p) => p.perfil_id).map((p) => [p.perfil_id as string, p.nombre]));
  const fotos = (fotosRes.data ?? []) as { reporte_id: string; path: string }[];
  const firmadas = new Map<string, string>();
  if (fotos.length) {
    const { data: enlaces } = await supabase.storage.from("sgsst").createSignedUrls(fotos.map((f) => f.path), 600);
    for (const e of enlaces ?? []) if (e.path && e.signedUrl) firmadas.set(e.path, e.signedUrl);
  }
  const reportes: ReporteGestion[] = ((data ?? []) as Omit<ReporteGestion, "fotos" | "quien">[]).map((r) => ({
    ...r,
    quien: nombres.get(r.reportado_por) ?? "Alguien sin ficha de empleado",
    fotos: fotos.filter((f) => f.reporte_id === r.id).map((f) => firmadas.get(f.path)).filter((u): u is string => !!u),
  }));
  return (
    <div className="mx-auto w-full max-w-3xl flex-1 space-y-3 p-4 sm:p-6 lg:max-w-5xl">
      <Link href="/sgsst" className="text-sm text-slate-600 underline">
        ← SG-SST
      </Link>
      <h1 className="text-lg font-bold text-slate-900">Actos y condiciones inseguras</h1>
      <p className="text-sm text-slate-600">
        Los reporta cualquiera desde su celular (menú → Reportar condición insegura). Quien reportó ve en qué va y lo que escribas al cerrarlo.
      </p>
      <div className="flex gap-2">
        {FILTROS.map((f) => (
          <Link key={f.id} href={`/sgsst/reportes?ver=${f.id}`} className={`inline-flex min-h-11 items-center rounded-full border px-3 text-sm ${f.id === filtro.id ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300"}`}>
            {f.nombre}
          </Link>
        ))}
      </div>
      {error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">No se pudieron leer los reportes: {error.message}</p>
      ) : reportes.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-600">No hay reportes {filtro.id === "abiertos" ? "por atender" : "cerrados"}.</p>
      ) : (
        <ul className="space-y-2 lg:grid lg:grid-cols-2 lg:items-start lg:gap-2 lg:space-y-0">
          {reportes.map((r) => (
            <AtenderReporte key={r.id} r={r} trabaja={trabaja} />
          ))}
        </ul>
      )}
    </div>
  );
}
