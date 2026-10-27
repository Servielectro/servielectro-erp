import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requierePermiso } from "@/lib/permisos";
import { CampoSst } from "@/app/(campo)/sgsst/campo/CampoSst";

// Llenar actas de obra en sitio (migración 85): el mismo llenado de SG-SST, en el ámbito de
// Proyectos. Se guarda en el celular (public/sw.js) y abre sin señal.
export default async function CampoActasPage({ searchParams }: { searchParams: Promise<{ proyecto?: string; formato?: string }> }) {
  await requierePermiso("proyectos", "trabajar");
  const { proyecto, formato } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/actas/campo");
  const { data: perfil } = await supabase.from("perfiles").select("nombre, cedula").eq("id", user.id).maybeSingle();
  return <CampoSst ambito="proyectos" proyectoInicial={proyecto ?? null} formatoInicial={formato ?? null} yo={{ id: user.id, nombre: perfil?.nombre ?? "", cedula: perfil?.cedula ?? "" }} />;
}
