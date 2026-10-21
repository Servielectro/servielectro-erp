import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { tienePermiso } from "@/lib/permisos";
import { getClientesActivos, type ClienteResumen } from "@/lib/supabase/clientes";
import { NuevaVisitaForm } from "./NuevaVisitaForm";

const ESTADO: Record<string, string> = {
  programada: "Programada",
  en_curso: "En curso",
  firmada: "Firmada",
  cerrada: "Cerrada",
  cancelada: "Cancelada",
};

export default async function OperativoPage() {
  const supabase = await createClient();
  const puedeCrear = await tienePermiso("operativo", "trabajar");
  const veComercial = await tienePermiso("comercial", "consultar");
  const creaClientes = await tienePermiso("comercial", "trabajar");

  const [{ data: visitas, error }, tecnicosRes, clientes] = await Promise.all([
    supabase
      .from("visitas")
      .select("id, titulo, cliente_nombre, direccion, estado, tipo, fecha_programada, tecnico_id")
      .order("fecha_programada", { ascending: false })
      .limit(100),
    puedeCrear ? supabase.rpc("fn_tecnicos_asignables") : Promise.resolve({ data: [], error: null }),
    // La lista de clientes exige Comercial; sin eso, el nombre del cliente se escribe a mano.
    veComercial ? getClientesActivos(supabase).catch(() => [] as ClienteResumen[]) : Promise.resolve([]),
  ]);

  const tecnicos = ((tecnicosRes.data ?? []) as { id: string; nombre: string }[]).map((t) => ({
    id: t.id,
    nombre: t.nombre,
  }));
  const nombreTecnico = new Map(tecnicos.map((t) => [t.id, t.nombre]));

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 p-4 sm:p-6">
      <h1 className="mb-4 text-center text-sm font-bold text-slate-900">Operativo — visitas técnicas</h1>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Link href="/operativo/tareas" className="rounded-lg border border-slate-300 bg-white p-4 text-center shadow-sm active:bg-slate-50">
          <span className="block text-2xl">🗂️</span>
          <span className="text-sm font-semibold text-slate-900">Tablero de tareas</span>
        </Link>
        <Link href="/operativo/sugerencias" className="rounded-lg border border-slate-300 bg-white p-4 text-center shadow-sm active:bg-slate-50">
          <span className="block text-2xl">🧾</span>
          <span className="text-sm font-semibold text-slate-900">Sugerencias de los técnicos</span>
        </Link>
        <Link href="/operativo/agenda" className="rounded-lg border border-slate-300 bg-white p-4 text-center shadow-sm active:bg-slate-50">
          <span className="block text-2xl">📅</span>
          <span className="text-sm font-semibold text-slate-900">Agenda del equipo</span>
        </Link>
      </div>

      {puedeCrear && (
        <NuevaVisitaForm
          tecnicos={tecnicos}
          clientes={clientes}
          veClientes={veComercial}
          puedeCrearCliente={creaClientes}
          errorTecnicos={tecnicosRes.error ? tecnicosRes.error.message : null}
        />
      )}

      <h2 className="mb-2 mt-6 text-sm font-semibold text-slate-900">Visitas</h2>
      {error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">No se pudieron leer las visitas: {error.message}</p>
      ) : (visitas ?? []).length === 0 ? (
        <p className="text-sm text-slate-500">Todavía no hay visitas.</p>
      ) : (
        <ul className="divide-y divide-slate-200 rounded-lg border border-slate-300 bg-white">
          {(visitas ?? []).map((v) => (
            <li key={v.id} className="text-sm">
              <Link href={`/operativo/visitas/${v.id}`} className="block p-3 active:bg-slate-50">
              <p className="font-semibold text-slate-900">{v.titulo}</p>
              <p className="text-xs text-slate-600">
                {ESTADO[v.estado] ?? v.estado}
                {v.fecha_programada ? ` · ${v.fecha_programada}` : ""}
                {v.tipo === "obra" ? " · Obra" : ""}
                {v.tecnico_id ? ` · ${nombreTecnico.get(v.tecnico_id) ?? "técnico"}` : " · sin asignar"}
              </p>
              {(v.cliente_nombre || v.direccion) && (
                <p className="text-xs text-slate-500">{[v.cliente_nombre, v.direccion].filter(Boolean).join(" · ")}</p>
              )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
