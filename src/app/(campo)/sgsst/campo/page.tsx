import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requierePermiso } from "@/lib/permisos";
import { CampoSst } from "./CampoSst";

// Llenado de formatos de SG-SST en sitio. Esta página se guarda en el celular (public/sw.js) y
// abre sin señal; las plantillas y lo llenado viven en la base local (src/lib/sst/local.ts).
export default async function CampoSstPage({ searchParams }: { searchParams: Promise<{ formato?: string }> }) {
  await requierePermiso("sgsst", "trabajar");
  const { formato } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/sgsst/campo");
  const { data: perfil } = await supabase.from("perfiles").select("nombre, cedula").eq("id", user.id).maybeSingle();
  return <CampoSst formatoInicial={formato ?? null} yo={{ id: user.id, nombre: perfil?.nombre ?? "", cedula: perfil?.cedula ?? "" }} />;
}
