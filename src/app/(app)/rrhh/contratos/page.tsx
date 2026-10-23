import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { MarcoRrhh } from "@/components/rrhh/FiltrosRrhh";
import { CLASE_CONTRATO, ESTADO_CONTRATO, TIPO_CONTRATO } from "@/lib/contratos";
import { nombreCompleto } from "@/lib/personal";
import { fechaCorta } from "@/lib/rrhh-registros";

const FILTROS = [
  { id: "activos", nombre: "Borradores y vigentes" },
  { id: "borrador", nombre: "Borradores" },
  { id: "vigente", nombre: "Vigentes" },
  { id: "todos", nombre: "Todos" },
];

// RRHH → Contratos laborales (migración 67): contratos de empleados y colaboradores (término
// fijo, indefinido, obra o labor, prestación de servicios). Los contratos con clientes o
// proveedores no van acá.
export default async function ContratosPage({ searchParams }: { searchParams: Promise<{ estado?: string }> }) {
  const { estado } = await searchParams;
  const filtro = FILTROS.find((f) => f.id === estado)?.id ?? "activos";
  const supabase = await createClient();
  const { data: veTodo } = await supabase.rpc("fn_rrhh_ve_todo");
  if (veTodo !== true) {
    return (
      <MarcoRrhh titulo="Contratos laborales">
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">Los contratos laborales requieren RRHH en nivel “trabajar”.</p>
      </MarcoRrhh>
    );
  }
  let q = supabase
    .from("contratos_laborales")
    .select("id, tipo, clase, estado, trabajador, fecha_contrato, fecha_inicio, fecha_fin, empleados(primer_nombre, otros_nombres, primer_apellido, segundo_apellido)")
    .order("created_at", { ascending: false })
    .limit(200);
  if (filtro === "activos") q = q.in("estado", ["borrador", "vigente"]);
  else if (filtro !== "todos") q = q.eq("estado", filtro);
  const { data, error } = await q;
  const contratos = (data ?? []) as unknown as {
    id: string;
    tipo: string;
    clase: string;
    estado: string;
    trabajador: string | null;
    fecha_contrato: string | null;
    fecha_inicio: string | null;
    fecha_fin: string | null;
    empleados: { primer_nombre: string; otros_nombres: string | null; primer_apellido: string; segundo_apellido: string | null } | null;
  }[];

  return (
    <MarcoRrhh
      titulo="Contratos laborales"
      ayuda="Contratos de empleados y colaboradores. Cree el documento desde una plantilla y asócielo al colaborador. Use Renovar u Otro sí si el contrato ya existe."
    >
      <div className="mb-3 grid grid-cols-2 gap-2">
        <Link href="/rrhh/contratos/nuevo" className="flex min-h-11 items-center justify-center rounded-lg bg-slate-900 text-sm font-semibold text-white">
          + Generar contrato
        </Link>
        <Link href="/rrhh/contratos/plantillas" className="flex min-h-11 items-center justify-center rounded-lg border border-slate-900 bg-white text-sm font-semibold">
          Plantillas y cláusulas
        </Link>
      </div>
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {FILTROS.map((f) => (
          <Link
            key={f.id}
            href={`/rrhh/contratos?estado=${f.id}`}
            className={`flex min-h-9 items-center justify-center rounded-md border px-2 text-xs font-semibold ${
              f.id === filtro ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700"
            }`}
          >
            {f.nombre}
          </Link>
        ))}
      </div>
      {error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error.message}</p>
      ) : contratos.length === 0 ? (
        <p className="text-sm text-slate-500">No hay contratos en este filtro.</p>
      ) : (
        <ul className="divide-y divide-slate-200 rounded-lg border border-slate-300 bg-white">
          {contratos.map((c) => (
            <li key={c.id}>
              <Link href={`/rrhh/contratos/${c.id}`} className="block p-3 active:bg-slate-50">
                <p className="text-sm font-semibold text-slate-900">{c.empleados ? nombreCompleto(c.empleados) : (c.trabajador ?? "—")}</p>
                <p className="text-xs text-slate-600">
                  {TIPO_CONTRATO[c.tipo] ?? c.tipo}
                  {c.clase !== "original" ? ` · ${CLASE_CONTRATO[c.clase]}` : ""} · {ESTADO_CONTRATO[c.estado] ?? c.estado}
                  {c.fecha_inicio ? ` · desde ${fechaCorta(c.fecha_inicio)}` : ""}
                  {c.fecha_fin ? ` hasta ${fechaCorta(c.fecha_fin)}` : ""}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </MarcoRrhh>
  );
}
