import { requierePermiso } from "@/lib/permisos";

// SG-SST (migración 75): la gestión arma plantillas y el plan; el SST de obra llena en sitio
// (/sgsst/campo, fuera de este layout para que abra sin señal). Sin el módulo, nada se sirve.
export default async function SgsstLayout({ children }: { children: React.ReactNode }) {
  await requierePermiso("sgsst", "consultar");
  return children;
}
