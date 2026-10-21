import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requierePermiso, tienePermiso } from "@/lib/permisos";
import { AppTecnico } from "./AppTecnico";

// App de campo del técnico. Esta página se guarda en el celular (public/sw.js) y abre
// sin señal; todo lo demás sale de la base local del celular (src/lib/tecnico).
//
// Va FUERA del layout del ERP, a propósito: sin el menú pesado y sin el cierre por
// inactividad, que en campo sacaría al técnico a /login sin señal para volver a entrar.
export default async function TecnicoPage() {
  await requierePermiso("tecnico", "trabajar");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/tecnico");

  const { data: perfil } = await supabase
    .from("perfiles")
    .select("nombre, cedula")
    .eq("id", user.id)
    .maybeSingle();

  return (
    <AppTecnico
      tecnico={{
        id: user.id,
        nombre: perfil?.nombre ?? user.email ?? "",
        cedula: perfil?.cedula ?? "",
        puedeEditarPerfil: await tienePermiso("configuracion", "responsable"),
      }}
    />
  );
}
