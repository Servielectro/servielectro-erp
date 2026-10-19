import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { tienePermiso } from "@/lib/permisos";
import { cargarDatosTareas } from "@/lib/supabase/tareas";
import { AgendaPersonal } from "@/components/tareas/AgendaPersonal";
import { AgendaEquipo, type VisitaAgenda } from "@/components/tareas/AgendaEquipo";

// Agenda por rol.
//   - Mi agenda (cualquiera con sesión): sus tareas internas (nadie más las ve, ni el
//     administrador), las de equipo que le asignaron y, si es técnico, sus visitas.
//   - Equipo (operativo/consultar: coordinador, administrador): tareas de equipo y visitas
//     de todos, por día y por persona. Las internas de cada uno no aparecen.
export default async function AgendaPage(props: PageProps<"/agenda">) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/agenda");

  const { vista } = await props.searchParams;
  const [puedeAsignar, veEquipo] = await Promise.all([
    tienePermiso("operativo", "trabajar"),
    tienePermiso("operativo", "consultar"),
  ]);
  const equipo = vista === "equipo" && veEquipo;

  const [datos, visitasRes] = await Promise.all([
    cargarDatosTareas(supabase, user.id, puedeAsignar),
    (() => {
      const q = supabase
        .from("visitas")
        .select("id, titulo, cliente_nombre, fecha_programada, estado, tecnico_id")
        .in("estado", ["programada", "en_curso"])
        .order("fecha_programada", { ascending: true })
        .limit(300);
      return equipo ? q : q.eq("tecnico_id", user.id);
    })(),
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
    <div className="mx-auto w-full max-w-2xl flex-1">
      {veEquipo && (
        <div className="mx-3 mt-3 flex rounded-lg border border-slate-300 bg-white p-0.5 sm:mx-4">
          <Link
            href="/agenda"
            className={`flex min-h-11 flex-1 items-center justify-center rounded-md text-base font-medium ${!equipo ? "bg-slate-900 text-white" : "text-slate-700"}`}
          >
            Mi agenda
          </Link>
          <Link
            href="/agenda?vista=equipo"
            className={`flex min-h-11 flex-1 items-center justify-center rounded-md text-base font-medium ${equipo ? "bg-slate-900 text-white" : "text-slate-700"}`}
          >
            Equipo
          </Link>
        </div>
      )}

      {datos.error ? (
        <p className="m-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">No se pudo cargar la agenda: {datos.error}</p>
      ) : equipo ? (
        <div className="p-3 sm:p-4">
          <h1 className="mb-3 text-center text-base font-bold">Agenda del equipo</h1>
          <AgendaEquipo tareas={datos.tareas} visitas={visitas} obras={datos.obras} personas={datos.personas} />
        </div>
      ) : (
        <AgendaPersonal
          yo={user.id}
          puedeAsignar={puedeAsignar}
          tareasIniciales={datos.tareas}
          obras={datos.obras}
          personas={datos.personas}
          visitas={visitas}
        />
      )}
    </div>
  );
}
