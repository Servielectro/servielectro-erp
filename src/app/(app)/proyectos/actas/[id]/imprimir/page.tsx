import { redirect } from "next/navigation";

// La impresión del acta ahora es la vista previa como documento (/documento/[id]): A4, prosa legal y
// firmas. Esta ruta queda para los enlaces viejos.
export default async function ImprimirActaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/documento/${id}?volver=/proyectos/actas/${id}`);
}
