import { requierePermiso } from "@/lib/permisos";

export default async function ProyectosLayout({ children }: { children: React.ReactNode }) {
  await requierePermiso("proyectos", "consultar");
  return children;
}
