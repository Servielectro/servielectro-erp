import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAccesoRrhh } from "@/lib/supabase/rrhh-acceso";
import { getProyectosNombres } from "@/lib/supabase/proyectos";
import { FiltrosRrhh, MarcoRrhh } from "@/components/rrhh/FiltrosRrhh";
import { COLUMNAS_GASTO, pesos, type Gasto } from "@/lib/rrhh-registros";
import { GastosRrhh } from "./GastosRrhh";

const FILTROS = [
  { id: "pendientes", nombre: "Por revisar (sin proyecto u observados)" },
  { id: "sin_proyecto", nombre: "Sin proyecto" },
  { id: "por_reembolsar", nombre: "Pagados de su bolsillo, sin reembolsar" },
  { id: "todos", nombre: "Todos" },
];

// Los gastos de todos los técnicos, para Alejandra (RRHH "trabajar"). Asignar proyecto,
// observar y marcar reembolso; el monto y la factura no se tocan (la base no lo deja).
export default async function GastosRrhhPage({ searchParams }: { searchParams: Promise<{ persona?: string; estado?: string }> }) {
  const { persona, estado } = await searchParams;
  const filtro = FILTROS.find((f) => f.id === estado)?.id ?? "pendientes";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/rrhh/gastos");
  const acceso = await getAccesoRrhh(supabase, user.id);

  if (!acceso.veTodo) {
    return (
      <MarcoRrhh titulo="Gastos del personal">
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Ver los gastos de todos requiere RRHH en nivel “trabajar”. Tus propios gastos están en Técnico → Mi perfil.
        </p>
      </MarcoRrhh>
    );
  }

  let q = supabase.from("gastos").select(COLUMNAS_GASTO).order("fecha", { ascending: false }).limit(300);
  if (persona) q = q.eq("persona_id", persona);
  if (filtro === "pendientes") q = q.neq("estado", "anulado").or("proyecto_id.is.null,estado.eq.observado");
  if (filtro === "sin_proyecto") q = q.neq("estado", "anulado").is("proyecto_id", null);
  if (filtro === "por_reembolsar") q = q.neq("estado", "anulado").eq("pagado_con", "propio").is("reembolsado_en", null);
  const [{ data, error }, proyectos] = await Promise.all([q, getProyectosNombres(supabase)]);
  const gastos = (data ?? []) as unknown as Gasto[];
  const total = gastos.filter((g) => g.estado !== "anulado").reduce((s, g) => s + Number(g.monto), 0);

  return (
    <MarcoRrhh titulo="Gastos del personal" ayuda="Compras en sitio y transportes que registran los técnicos, con su factura.">
      <FiltrosRrhh personas={acceso.personas} estados={FILTROS} />
      {error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">No se pudieron leer los gastos: {error.message}</p>
      ) : (
        <>
          <p className="mb-2 text-xs text-slate-600">
            {gastos.length} {gastos.length === 1 ? "gasto" : "gastos"} · {pesos(total)}
          </p>
          <GastosRrhh
            gastos={gastos}
            personas={Object.fromEntries(acceso.personas.map((p) => [p.id, p.nombre]))}
            proyectos={proyectos ?? []}
          />
        </>
      )}
    </MarcoRrhh>
  );
}
