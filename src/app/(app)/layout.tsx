import { AppHeader } from "@/components/AppHeader";
import { CierrePorInactividad } from "@/components/CierrePorInactividad";
import { accesosDeMenu, getMisPermisos } from "@/lib/permisos";
import { createClient } from "@/lib/supabase/server";

// Layout compartido por toda la app autenticada (todo menos /login) — el menú
// de navegación global vive acá una sola vez, no repetido por pantalla.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const accesos = accesosDeMenu(await getMisPermisos());
  const usuario = (await (await createClient()).auth.getUser()).data.user?.email ?? null;
  return (
    <div className="flex min-h-screen flex-col bg-slate-50 print:block print:min-h-0 print:bg-white">
      <AppHeader accesos={accesos} usuario={usuario} />
      <div className="flex flex-1 flex-col">{children}</div>
      <CierrePorInactividad />
    </div>
  );
}
