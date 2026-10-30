import { requierePermiso } from "@/lib/permisos";

// Marketing (migraciones 125 y 126). Sin el módulo, nada se sirve; los datos los cuida RLS.
export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  await requierePermiso("marketing", "consultar");
  return children;
}
