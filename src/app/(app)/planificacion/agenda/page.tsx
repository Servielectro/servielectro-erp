import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { cargarDatosTareas } from "@/lib/supabase/tareas";
import { eventoDeFila, SELECT_EVENTO, type Evento } from "@/lib/eventos";
import { CalendarioAgenda } from "@/components/agenda/CalendarioAgenda";

// Agenda: el calendario con los eventos y las tareas de Planificación con fecha. El layout
// ya exige planificacion/trabajar. Lo que ve cada uno lo decide la RLS (las internas de
// los demás no llegan, ni al administrador).
export default async function AgendaPlanificacionPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/planificacion/agenda");

  const [datos, eventosRes] = await Promise.all([
    cargarDatosTareas(supabase, user.id, true, "planificacion"),
    supabase.from("eventos").select(SELECT_EVENTO).order("inicio").limit(2000),
  ]);
  // Sin la migración 55 la tabla no existe: el calendario muestra las tareas y lo avisa.
  const eventosDisponibles = !eventosRes.error;
  const eventos: Evento[] = (eventosRes.data ?? []).map(eventoDeFila);

  return (
    <>
      <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-3 pt-3 text-sm sm:px-4">
        <Link href="/planificacion" className="flex min-h-11 items-center text-slate-600">
          ← Planificación
        </Link>
      </div>
      {datos.error ? (
        <p className="mx-auto mt-4 max-w-3xl rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          No se pudo cargar la agenda: {datos.error}
        </p>
      ) : (
        <CalendarioAgenda
          yo={user.id}
          eventosIniciales={eventos}
          eventosDisponibles={eventosDisponibles}
          tareasIniciales={datos.tareas}
          obras={datos.obras}
          personas={datos.personas}
          grupos={datos.grupos}
          conResponsable={datos.conResponsable}
        />
      )}
    </>
  );
}
