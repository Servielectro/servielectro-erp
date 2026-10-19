import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { tienePermiso } from "@/lib/permisos";
import { cargarDatosTareas } from "@/lib/supabase/tareas";
import { AgendaEquipo, type VisitaAgenda } from "@/components/tareas/AgendaEquipo";

// Agenda del equipo (el layout de Operativo ya exige operativo/consultar): por día, las
// tareas de obra y las visitas de cada técnico, con filtro por persona. Las tareas internas
// y compartidas de Planificación no aparecen acá.
export default async function AgendaEquipoPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/operativo/agenda");

  const puedeAsignar = await tienePermiso("operativo", "trabajar");
  const [datos, visitasRes] = await Promise.all([
    cargarDatosTareas(supabase, user.id, puedeAsignar, "operativo"),
    supabase
      .from("visitas")
      .select("id, titulo, cliente_nombre, fecha_programada, estado, tecnico_id")
      .in("estado", ["programada", "en_curso"])
      .order("fecha_programada", { ascending: true })
      .limit(300),
  ]);

  const visitas: VisitaAgenda[] = (visitasRes.data ?? []).map((v) => ({
    id: v.id,
    titulo: v.titulo,
    cliente: v.cliente_nombre,
    fecha: v.fecha_programada,
    estado: v.estado,
    tecnicoId: v.tecnico_id,
  }));

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 p-3 sm:p-4">
      <div className="mb-3 flex items-center gap-3 text-sm">
        <Link href="/operativo" className="flex min-h-11 items-center text-slate-600">
          ← Operativo
        </Link>
        <h1 className="flex-1 text-center text-base font-bold">Agenda del equipo</h1>
        <Link href="/operativo/tareas" className="flex min-h-11 items-center text-slate-600">
          Tablero →
        </Link>
      </div>
      {datos.error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">No se pudo cargar la agenda: {datos.error}</p>
      ) : (
        <AgendaEquipo tareas={datos.tareas} visitas={visitas} obras={datos.obras} personas={datos.personas} />
      )}
    </div>
  );
}
