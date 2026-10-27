import { redirect } from "next/navigation";

// El aviso "tu reporte de SST" (migración 77) apunta aquí: es la misma pantalla de reportar.
export default function MisReportesPage() {
  redirect("/reportar");
}
