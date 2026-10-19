import { AppHeader } from "@/components/AppHeader";
import { accesosDeMenu, getMisPermisos } from "@/lib/permisos";

// Pantallas de campo: el MISMO encabezado del ERP (logo y menú, con lo que el rol puede
// abrir y nada más). Sin el cierre por inactividad, a propósito: en campo sacaría al
// técnico a /login sin señal para volver a entrar. La letra sale de la escala única
// de globals.css (en tablet sube sola).
//
// Este encabezado queda dentro de la copia de /tecnico que guarda el celular: sin señal
// se sigue viendo; los enlaces a otras pantallas sí necesitan señal.
export default async function CampoLayout({ children }: { children: React.ReactNode }) {
  const accesos = accesosDeMenu(await getMisPermisos());
  return (
    <div className="flex min-h-screen flex-col bg-slate-100 text-base text-slate-900">
      <AppHeader accesos={accesos} />
      <div className="flex-1">{children}</div>
    </div>
  );
}
