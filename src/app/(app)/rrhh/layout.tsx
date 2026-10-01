import { requierePermiso } from "@/lib/permisos";

// RRHH maneja salarios y documentos de identidad: sin permiso del módulo, nada se sirve.
export default async function RrhhLayout({ children }: { children: React.ReactNode }) {
  await requierePermiso("rrhh", "consultar");
  return children;
}
