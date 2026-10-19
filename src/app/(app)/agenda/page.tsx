import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { tienePermiso } from "@/lib/permisos";
import { cargarDatosTareas } from "@/lib/supabase/tareas";
import { AgendaPersonal } from "@/components/tareas/AgendaPersonal";

// Agenda personal: para cualquiera con sesión. Lo que ve lo decide la base: sus tareas
// internas (nadie más las ve, ni el administrador) y las de equipo que le asignaron.
export default async function AgendaPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/agenda");

  const puedeAsignar = await tienePermiso("operativo", "trabajar");
  const datos = await cargarDatosTareas(supabase, user.id, puedeAsignar);

  if (datos.error) {
    return (
      <div className="mx-auto w-full max-w-2xl p-4">
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">No se pudo cargar la agenda: {datos.error}</p>
      </div>
    );
  }

  return (
    <AgendaPersonal
      yo={user.id}
      puedeAsignar={puedeAsignar}
      tareasIniciales={datos.tareas}
      obras={datos.obras}
      personas={datos.personas}
    />
  );
}
