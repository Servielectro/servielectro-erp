import { AppHeader } from "@/components/AppHeader";
import { CierrePorInactividad } from "@/components/CierrePorInactividad";
import { getMisPermisos } from "@/lib/permisos";

// Layout compartido por toda la app autenticada (todo menos /login) — el menú
// de navegación global vive acá una sola vez, no repetido por pantalla.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const permisos = await getMisPermisos();
  const accesos = {
    modulos: Object.keys(permisos),
    baseDatos: permisos.comercial?.nivel === "responsable",
  };
  return (
    <div className="flex min-h-screen flex-col bg-slate-50 print:block print:min-h-0 print:bg-white">
      <AppHeader accesos={accesos} />
      <div className="flex flex-1 flex-col">{children}</div>
      <CierrePorInactividad />
    </div>
  );
}
