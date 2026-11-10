import { PaginaSugerencias } from "@/components/sugerencias/PaginaSugerencias";

// Sugerencias para la aplicación de SG-SST (modulo_sugerencias). El layout del módulo ya exige el permiso.
export default function SugerenciasPage() {
  return <PaginaSugerencias modulo="sgsst" nombreModulo="SG-SST" volverA="/sgsst" />;
}
