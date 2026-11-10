import { PaginaSugerencias } from "@/components/sugerencias/PaginaSugerencias";

// Sugerencias para la aplicación de RRHH (modulo_sugerencias). El layout del módulo ya exige el permiso.
export default function SugerenciasPage() {
  return <PaginaSugerencias modulo="rrhh" nombreModulo="RRHH" volverA="/rrhh" />;
}
