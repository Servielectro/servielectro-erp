import { PaginaSugerencias } from "@/components/sugerencias/PaginaSugerencias";

// Sugerencias para la aplicación de Contable (modulo_sugerencias). El layout del módulo ya exige el permiso.
export default function SugerenciasPage() {
  return <PaginaSugerencias modulo="contable" nombreModulo="Contable" volverA="/contable" />;
}
