import { AppHeader } from "@/components/AppHeader";
import { BannerDemo } from "@/components/BannerDemo";
import { CierrePorInactividad } from "@/components/CierrePorInactividad";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { accesosDeMenu, getMisPermisos, seccionDeRuta, seccionesOcultas } from "@/lib/permisos";
import { createClient } from "@/lib/supabase/server";

// Layout compartido por toda la app autenticada (todo menos /login) — el menú
// de navegación global vive acá una sola vez, no repetido por pantalla.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Permisos por sección (migración 122): lo recortado no sale en el menú ni se abre por la URL.
  const { ocultas, todas } = await seccionesOcultas();
  const seccion = seccionDeRuta((await headers()).get("x-ruta") ?? "", todas);
  if (seccion && ocultas.includes(seccion)) redirect("/");
  const accesos = { ...accesosDeMenu(await getMisPermisos()), seccionesOcultas: ocultas };
  const usuario = (await (await createClient()).auth.getUser()).data.user?.email ?? null;
  return (
    <div className="flex min-h-screen flex-col bg-slate-50 print:block print:min-h-0 print:bg-white">
      <BannerDemo />
      <AppHeader accesos={accesos} usuario={usuario} />
      <div className="flex flex-1 flex-col">{children}</div>
      <CierrePorInactividad />
    </div>
  );
}
