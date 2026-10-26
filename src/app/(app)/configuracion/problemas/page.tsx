import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requierePermiso } from "@/lib/permisos";
import { COLUMNAS_REPORTE, ESTADO_REPORTE, type EstadoReporte, type ReporteProblema } from "@/lib/reportes-problema";
import { ProblemasAdmin } from "./ProblemasAdmin";

const FILTROS: { id: string; nombre: string; estados: EstadoReporte[] }[] = [
  { id: "abiertos", nombre: "Por atender", estados: ["nuevo", "en_revision"] },
  { id: "cerrados", nombre: "Cerrados", estados: ["resuelto", "no_es_error"] },
  { id: "todos", nombre: "Todos", estados: ["nuevo", "en_revision", "resuelto", "no_es_error"] },
];

// Reportes de problema de todos (migración 73). Los atiende quien administra (Configuración
// "responsable"): los pone en revisión y los cierra con una nota que el que reportó ve.
export default async function ProblemasPage({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  await requierePermiso("configuracion", "responsable");
  const { ver } = await searchParams;
  const filtro = FILTROS.find((f) => f.id === ver) ?? FILTROS[0];
  const supabase = await createClient();
  const [reportesRes, usuariosRes, conteoRes] = await Promise.all([
    supabase.from("reportes_problema").select(COLUMNAS_REPORTE).in("estado", filtro.estados).order("reportado_en", { ascending: false }).limit(300),
    supabase.rpc("fn_listar_usuarios"),
    supabase.from("reportes_problema").select("estado, gravedad").in("estado", ["nuevo", "en_revision"]),
  ]);
  const reportes = (reportesRes.data ?? []) as ReporteProblema[];
  const nombres = Object.fromEntries(
    ((usuariosRes.data ?? []) as { id: string; email: string; nombre?: string | null }[]).map((u) => [u.id, u.nombre || u.email]),
  );
  const abiertos = (conteoRes.data ?? []) as { estado: EstadoReporte; gravedad: string }[];
  const bloqueantes = abiertos.filter((r) => r.gravedad === "bloquea").length;

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 p-4 sm:p-6 lg:max-w-6xl">
      <Link href="/configuracion" className="text-sm text-slate-600 underline">
        ← Configuración
      </Link>
      <h1 className="mt-2 text-lg font-bold text-slate-900">Reportes de problema</h1>
      <p className="mb-3 text-sm text-slate-600">
        Lo que reportan desde el botón “Registrar problema” de la barra de arriba. Quien reportó ve el estado y la nota con que lo cierres.
      </p>
      <p className="mb-3 text-sm">
        <span className="font-semibold">{abiertos.length}</span> por atender
        {bloqueantes > 0 && (
          <>
            {" "}· <span className="font-semibold text-red-800">{bloqueantes} bloquean el trabajo</span>
          </>
        )}
      </p>
      <div className="mb-3 flex flex-wrap gap-2">
        {FILTROS.map((f) => (
          <Link
            key={f.id}
            href={`/configuracion/problemas?ver=${f.id}`}
            className={`inline-flex min-h-11 items-center rounded-full border px-3 text-sm font-medium ${
              f.id === filtro.id ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 text-slate-700"
            }`}
          >
            {f.nombre}
          </Link>
        ))}
      </div>
      {reportesRes.error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">No se pudieron leer los reportes: {reportesRes.error.message}</p>
      ) : reportes.length === 0 ? (
        <p className="text-sm text-slate-500">No hay reportes {filtro.id === "abiertos" ? "por atender" : "en este filtro"}.</p>
      ) : (
        <ProblemasAdmin reportes={reportes} nombres={nombres} estados={ESTADO_REPORTE} />
      )}
    </div>
  );
}
