import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { tienePermiso } from "@/lib/permisos";
import { cargarDatosTareas } from "@/lib/supabase/tareas";
import { TableroTareas } from "@/components/tareas/TableroTareas";

// Tablero de obra de Operativo (el layout ya exige operativo/consultar): solo tareas de
// equipo (proyecto o visita). Crear y asignar: operativo/trabajar (Coordinador, Administrador).
// Las internas y compartidas son de Planificación.
export default async function TareasPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/operativo/tareas");

  const puedeAsignar = await tienePermiso("operativo", "trabajar");
  const datos = await cargarDatosTareas(supabase, user.id, puedeAsignar, "operativo");

  return (
    <>
      <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-3 pt-3 text-sm sm:px-4">
        <Link href="/operativo" className="flex min-h-11 items-center text-slate-600">
          ← Operativo
        </Link>
        <h1 className="flex-1 text-center text-sm font-bold text-slate-900">Tablero de tareas</h1>
        <Link href="/operativo/agenda" className="flex min-h-11 items-center text-slate-600">
          Agenda del equipo →
        </Link>
      </div>
      {datos.error ? (
        <p className="mx-auto mt-4 max-w-3xl rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          No se pudieron cargar las tareas: {datos.error}
        </p>
      ) : (
        <TableroTareas
          modo="operativo"
          yo={user.id}
          puedeAsignar={puedeAsignar}
          puedeEliminar={puedeAsignar}
          tareasIniciales={datos.tareas}
          archivadasIniciales={datos.archivadas}
          conResponsable={datos.conResponsable}
          obras={datos.obras}
          personas={datos.personas}
          grupos={datos.grupos}
        />
      )}
    </>
  );
}
