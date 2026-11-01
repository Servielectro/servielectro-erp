import { requierePermiso } from "@/lib/permisos";

// Financiero (migraciones 128 y 129): espejo de SOLO LECTURA de Siigo. La contabilidad legal vive en
// Siigo; aquí solo se mira. Los datos los cuida la RLS y la falta de privilegios de escritura.
export default async function FinancieroLayout({ children }: { children: React.ReactNode }) {
  await requierePermiso("financiero", "consultar");
  return children;
}
