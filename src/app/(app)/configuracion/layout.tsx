import { requierePermiso } from "@/lib/permisos";

export default async function ConfiguracionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requierePermiso("configuracion", "consultar");
  return children;
}
