import { requierePermiso } from "@/lib/permisos";

// Planificación: las tareas administrativas y la Agenda. Solo administrativos
// (Administrador, Coordinador); el técnico no tiene este módulo y vuelve al inicio.
export default async function PlanificacionLayout({ children }: { children: React.ReactNode }) {
  await requierePermiso("planificacion", "trabajar");
  return children;
}
