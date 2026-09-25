import { requierePermiso } from "@/lib/permisos";

// Sin permiso sobre Comercial, ninguna pantalla del módulo se sirve (no solo se oculta).
export default async function ComercialLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requierePermiso("comercial", "consultar");
  return children;
}
