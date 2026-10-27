import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { tienePermiso } from "@/lib/permisos";
import { getAccesoRrhh } from "@/lib/supabase/rrhh-acceso";
import { COLUMNAS_NOTIFICACION, type Notificacion, type TipoNotificacion } from "@/lib/notificaciones";
import { ListaNotificaciones, PreferenciasNotificaciones } from "./NotificacionesCliente";

// Todas mis notificaciones y qué quiero que me avise. Va en el grupo (campo): la usan también los
// técnicos, sin el cierre por inactividad de la oficina.
export default async function NotificacionesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/notificaciones");

  const [notifRes, tiposRes, prefsRes, acceso, rrhh, sst] = await Promise.all([
    supabase.from("notificaciones").select(COLUMNAS_NOTIFICACION).order("creada_en", { ascending: false }).limit(100),
    supabase.from("notificacion_tipos").select("id, nombre, descripcion, para, por_defecto, orden").order("orden"),
    supabase.from("notificacion_preferencias").select("tipo, activa"),
    getAccesoRrhh(supabase, user.id),
    tienePermiso("rrhh", "trabajar"),
    tienePermiso("sgsst", "trabajar"),
  ]);
  // Solo los tipos que le pueden llegar a esta persona.
  const aplica = (t: TipoNotificacion) =>
    t.para === "tecnico" || (t.para === "aprobador" && (acceso.apruebaAbonos || acceso.apruebaPermisos)) || (t.para === "rrhh" && rrhh) || (t.para === "sst" && sst);
  const tipos = ((tiposRes.data ?? []) as TipoNotificacion[]).filter(aplica);
  const prefs = Object.fromEntries(((prefsRes.data ?? []) as { tipo: string; activa: boolean }[]).map((p) => [p.tipo, p.activa]));

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 p-4 sm:p-6">
      <h1 className="text-lg font-bold text-slate-900">Notificaciones</h1>
      {notifRes.error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">No se pudieron leer las notificaciones: {notifRes.error.message}</p>
      ) : (
        <ListaNotificaciones iniciales={(notifRes.data ?? []) as Notificacion[]} />
      )}
      <PreferenciasNotificaciones tipos={tipos} prefs={prefs} yo={user.id} />
    </div>
  );
}
