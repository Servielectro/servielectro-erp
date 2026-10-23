import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { MarcoRrhh } from "@/components/rrhh/FiltrosRrhh";
import { ESTADO_LABORAL, nombreCompleto, type Empleado } from "@/lib/personal";

const FILTROS = [
  { id: "activos", nombre: "Activos" },
  { id: "en_pausa", nombre: "En pausa" },
  { id: "retirado", nombre: "Retirados" },
  { id: "todos", nombre: "Todos" },
];

// RRHH → Personal: la lista de fichas (migración 66). Contador de retirados y filtro de estado,
// como en NEXGO. Salarios y documentos de identidad: solo RRHH "trabajar" (lo exige la RLS).
export default async function PersonalPage({ searchParams }: { searchParams: Promise<{ estado?: string }> }) {
  const { estado } = await searchParams;
  const filtro = FILTROS.find((f) => f.id === estado)?.id ?? "activos";
  const supabase = await createClient();
  const { data: veTodo } = await supabase.rpc("fn_rrhh_ve_todo");
  if (veTodo !== true) {
    return (
      <MarcoRrhh titulo="Personal">
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">Ver las fichas del personal requiere RRHH en nivel “trabajar”.</p>
      </MarcoRrhh>
    );
  }
  const { data, error } = await supabase
    .from("empleados")
    .select("id, primer_nombre, otros_nombres, primer_apellido, segundo_apellido, numero_documento, cargo, estado_laboral, perfil_id")
    .order("primer_apellido");
  const todos = (data ?? []) as (Pick<Empleado, "id" | "primer_nombre" | "otros_nombres" | "primer_apellido" | "segundo_apellido" | "numero_documento" | "cargo" | "estado_laboral" | "perfil_id">)[];
  const lista = filtro === "todos" ? todos : todos.filter((e) => (filtro === "activos" ? e.estado_laboral === "activo" : e.estado_laboral === filtro));
  const retirados = todos.filter((e) => e.estado_laboral === "retirado").length;

  return (
    <MarcoRrhh titulo="Personal" ayuda="La ficha de cada colaborador: datos, hoja de vida, contrato, dotación, liquidaciones, desprendibles y caja menor.">
      <Link href="/rrhh/personal/nuevo" className="mb-3 flex min-h-11 w-full items-center justify-center rounded-lg bg-slate-900 text-sm font-semibold text-white">
        + Nuevo empleado
      </Link>
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {FILTROS.map((f) => (
          <Link
            key={f.id}
            href={`/rrhh/personal?estado=${f.id}`}
            className={`flex min-h-9 items-center justify-center rounded-md border px-2 text-xs font-semibold ${
              f.id === filtro ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700"
            }`}
          >
            {f.nombre}
            {f.id === "retirado" ? ` (${retirados})` : ""}
          </Link>
        ))}
      </div>
      {error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {/empleados/.test(error.message) ? "Falta correr la migración 66 en la base." : error.message}
        </p>
      ) : lista.length === 0 ? (
        <p className="text-sm text-slate-500">{todos.length === 0 ? "Todavía no hay fichas. Crea la primera." : "Nadie en este filtro."}</p>
      ) : (
        <ul className="divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-300 bg-white lg:grid lg:grid-cols-3 lg:gap-px lg:divide-y-0 lg:bg-slate-200">
          {lista.map((e) => (
            <li key={e.id} className="bg-white">
              <Link href={`/rrhh/personal/${e.id}`} className="block p-3 active:bg-slate-50">
                <p className="text-sm font-semibold text-slate-900">{nombreCompleto(e)}</p>
                <p className="text-xs text-slate-600">
                  {e.numero_documento}
                  {e.cargo ? ` · ${e.cargo}` : ""} · {ESTADO_LABORAL[e.estado_laboral] ?? e.estado_laboral}
                  {e.perfil_id ? "" : " · sin usuario del ERP"}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </MarcoRrhh>
  );
}
