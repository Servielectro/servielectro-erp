import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { cargarDatosTareas } from "@/lib/supabase/tareas";
import { TableroTareas } from "@/components/tareas/TableroTareas";

// Tablero de Planificación (el layout ya exige planificacion/trabajar): las tareas
// internas de cada uno y las compartidas con personas o grupos ("👥 Asignar al equipo").
// Las de obra viven en Operativo.
export default async function PlanificacionPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/planificacion");

  const datos = await cargarDatosTareas(supabase, user.id, true, "planificacion");

  return (
    <>
      <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-3 pt-3 text-sm sm:px-4">
        <h1 className="flex-1 text-base font-bold text-slate-900">Planificación</h1>
        <Link href="/planificacion/agenda" className="flex min-h-11 items-center text-slate-600">
          📅 Agenda →
        </Link>
      </div>
      {datos.error ? (
        <p className="mx-auto mt-4 max-w-3xl rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          No se pudieron cargar las tareas: {datos.error}
        </p>
      ) : (
        <TableroTareas
          modo="planificacion"
          yo={user.id}
          puedeAsignar
          tareasIniciales={datos.tareas}
          archivadasIniciales={datos.archivadas}
          obras={datos.obras}
          personas={datos.personas}
          grupos={datos.grupos}
          conResponsable={datos.conResponsable}
        />
      )}
    </>
  );
}
