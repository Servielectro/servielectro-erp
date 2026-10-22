import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requierePermiso } from "@/lib/permisos";
import { PantallaPerfil } from "@/components/rrhh/PantallaPerfil";
import { COLUMNAS_PERMISO, type Permiso } from "@/lib/rrhh-registros";
import { hoyColombia } from "@/lib/crm";
import { PermisosTecnico } from "./PermisosTecnico";

// Solicitud de permisos (migración 64; formato de NEXGO en docs/nexgo-solicitud-de-permiso.md).
// La regla del mismo día la exige la base; la pantalla la explica antes de enviar.
export default async function PermisosPage() {
  await requierePermiso("tecnico", "trabajar");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/tecnico/permisos");

  const { data, error } = await supabase
    .from("permisos_laborales")
    .select(COLUMNAS_PERMISO)
    .eq("persona_id", user.id)
    .order("desde", { ascending: false })
    .limit(60);

  return (
    <PantallaPerfil titulo="Mis permisos" ayuda="Pídelo con anticipación: para hoy solo se acepta calamidad doméstica. Lo aprueba Jhojan.">
      {error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">No se pudieron leer tus permisos: {error.message}</p>
      ) : (
        <PermisosTecnico yo={user.id} hoy={hoyColombia()} permisos={(data ?? []) as Permiso[]} />
      )}
    </PantallaPerfil>
  );
}
