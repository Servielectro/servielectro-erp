import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAccesoRrhh } from "@/lib/supabase/rrhh-acceso";
import { FiltrosRrhh, MarcoRrhh } from "@/components/rrhh/FiltrosRrhh";
import { COLUMNAS_PERMISO, type Permiso } from "@/lib/rrhh-registros";
import { hoyColombia } from "@/lib/crm";
import { PermisosRrhh } from "./PermisosRrhh";

const FILTROS = [
  { id: "abiertos", nombre: "Por decidir y aprobados" },
  { id: "solicitado", nombre: "Por decidir" },
  { id: "aprobado", nombre: "Aprobados (por gozar)" },
  { id: "gozado", nombre: "Gozados" },
  { id: "todos", nombre: "Todos" },
];

// Permisos de todo el personal. Jhojan (rrhh_aprobadores) aprueba o rechaza y confirma la
// compensación; RRHH marca "gozado", que es con lo que Alejandra costea.
export default async function PermisosRrhhPage({ searchParams }: { searchParams: Promise<{ persona?: string; estado?: string }> }) {
  const { persona, estado } = await searchParams;
  const filtro = FILTROS.find((f) => f.id === estado)?.id ?? "abiertos";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/rrhh/permisos");
  const acceso = await getAccesoRrhh(supabase, user.id);

  if (!acceso.veTodo && !acceso.apruebaPermisos) {
    return (
      <MarcoRrhh titulo="Permisos del personal">
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Ver los permisos de todos requiere RRHH en nivel “trabajar” o ser aprobador.
        </p>
      </MarcoRrhh>
    );
  }

  let q = supabase.from("permisos_laborales").select(COLUMNAS_PERMISO).order("desde", { ascending: false }).limit(300);
  if (persona) q = q.eq("persona_id", persona);
  if (filtro === "abiertos") q = q.in("estado", ["solicitado", "aprobado"]);
  else if (filtro !== "todos") q = q.eq("estado", filtro);
  const { data, error } = await q;

  return (
    <MarcoRrhh
      titulo="Permisos del personal"
      ayuda={acceso.apruebaPermisos ? "Tú apruebas o rechazas. RRHH marca cuándo se gozó." : "Los aprueba Jhojan. Tú marcas cuándo se gozó."}
    >
      <FiltrosRrhh personas={acceso.personas} estados={FILTROS} />
      {error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">No se pudieron leer los permisos: {error.message}</p>
      ) : (
        <PermisosRrhh
          permisos={(data ?? []) as Permiso[]}
          personas={Object.fromEntries(acceso.personas.map((p) => [p.id, p.nombre]))}
          yo={user.id}
          hoy={hoyColombia()}
          aprueba={acceso.apruebaPermisos}
          marcaGozado={acceso.veTodo}
        />
      )}
    </MarcoRrhh>
  );
}
