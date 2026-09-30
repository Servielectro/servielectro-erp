import { requierePermiso } from "@/lib/permisos";

// Sin permiso sobre Licitaciones, la pantalla no se sirve (no solo se oculta).
export default async function LicitacionesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requierePermiso("licitaciones", "consultar");
  return children;
}
