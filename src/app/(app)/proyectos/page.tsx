import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { tienePermiso } from "@/lib/permisos";
import { ESTADO_PROYECTO, type EstadoProyecto } from "@/lib/supabase/proyectos";

const FILTROS: { id: EstadoProyecto | "todos"; nombre: string }[] = [
  { id: "EN_EJECUCION", nombre: "En ejecución" },
  { id: "SUSPENDIDO", nombre: "Suspendidos" },
  { id: "CERRADO", nombre: "Cerrados" },
  { id: "todos", nombre: "Todos" },
];

export default async function ProyectosPage({ searchParams }: { searchParams: Promise<{ estado?: string }> }) {
  const { estado: estadoParam } = await searchParams;
  const filtro = FILTROS.find((f) => f.id === estadoParam)?.id ?? "EN_EJECUCION";
  const supabase = await createClient();
  const puedeCrear = (await tienePermiso("proyectos", "trabajar")) || (await tienePermiso("comercial", "trabajar"));

  let consulta = supabase
    .from("proyectos")
    // El nombre del cliente solo llega con permiso de Comercial (RLS de clientes); si no, null.
    .select("id, codigo, nombre, estado, fecha_inicio, fecha_fin_estimada, cotizacion_aprobada_id, clientes(nombre)")
    .order("created_at", { ascending: false })
    .limit(200);
  if (filtro !== "todos") consulta = consulta.eq("estado", filtro);
  const { data, error } = await consulta;
  const proyectos = (data ?? []) as unknown as {
    id: string;
    codigo: string;
    nombre: string;
    estado: EstadoProyecto;
    fecha_inicio: string | null;
    fecha_fin_estimada: string | null;
    cotizacion_aprobada_id: string | null;
    clientes: { nombre: string } | null;
  }[];

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 p-4 sm:p-6 lg:max-w-5xl">
      <h1 className="mb-1 text-center text-sm font-bold text-slate-900">Proyectos</h1>
      <p className="mb-4 text-center text-xs text-slate-600">
        El nombre de cada proyecto es lo que ven los técnicos, Operativo y RRHH.
      </p>

      {puedeCrear && (
        <Link
          href="/proyectos/nuevo"
          className="mb-4 flex min-h-11 w-full items-center justify-center rounded-lg bg-slate-900 px-4 py-3 text-sm font-semibold text-white"
        >
          + Nuevo proyecto
        </Link>
      )}

      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {FILTROS.map((f) => (
          <Link
            key={f.id}
            href={`/proyectos?estado=${f.id}`}
            className={`flex min-h-9 items-center justify-center rounded-md border px-2 text-xs font-semibold ${
              f.id === filtro ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700"
            }`}
          >
            {f.nombre}
          </Link>
        ))}
      </div>

      {error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">No se pudieron leer los proyectos: {error.message}</p>
      ) : proyectos.length === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
          {filtro === "EN_EJECUCION"
            ? "No hay proyectos en ejecución. Crea el primero para que los técnicos puedan cargarle gastos."
            : "No hay proyectos en este filtro."}
        </p>
      ) : (
        <ul className="divide-y divide-slate-200 rounded-lg border border-slate-300 bg-white">
          {proyectos.map((p) => (
            <li key={p.id}>
              <Link href={`/proyectos/${p.id}`} className="block p-3 active:bg-slate-50">
                <p className="text-sm font-semibold text-slate-900">{p.nombre}</p>
                <p className="text-xs text-slate-600">
                  {p.codigo} · {ESTADO_PROYECTO[p.estado] ?? p.estado}
                  {p.clientes?.nombre ? ` · ${p.clientes.nombre}` : ""}
                  {p.fecha_inicio ? ` · desde ${p.fecha_inicio}` : ""}
                  {!p.cotizacion_aprobada_id ? " · sin cotización" : ""}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
