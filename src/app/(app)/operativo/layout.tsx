import { requierePermiso } from "@/lib/permisos";

export default async function OperativoLayout({ children }: { children: React.ReactNode }) {
  await requierePermiso("operativo", "consultar");
  return children;
}
