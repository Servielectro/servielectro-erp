import { requierePermiso } from "@/lib/permisos";

// Contable (migraciones 128 y 129): espejo de SOLO LECTURA de Siigo. La contabilidad legal vive en
// Siigo; aquí solo se mira. Los datos los cuida la RLS y la falta de privilegios de escritura.
export default async function ContableLayout({ children }: { children: React.ReactNode }) {
  await requierePermiso("contable", "consultar");
  return children;
}
