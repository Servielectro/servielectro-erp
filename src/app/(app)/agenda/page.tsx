import { redirect } from "next/navigation";

// La Agenda ahora vive en Planificación (el calendario). Los enlaces viejos llegan acá.
// Quien no tiene Planificación (el técnico) vuelve al inicio desde el layout de allá.
export default function AgendaPage() {
  redirect("/planificacion/agenda");
}
