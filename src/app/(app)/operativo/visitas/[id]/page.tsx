import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { tienePermiso } from "@/lib/permisos";
import { getVisitaDetalle } from "@/lib/supabase/visita-detalle";
import { VisitaCoordinador } from "./VisitaCoordinador";

// Resultado de una visita para el coordinador (docs/2workers-detalle-visita-coordinador.md).
export default async function VisitaDetallePage(props: PageProps<"/operativo/visitas/[id]">) {
  const { id } = await props.params;
  const supabase = await createClient();
  const [v, puedeCerrar] = await Promise.all([getVisitaDetalle(supabase, id), tienePermiso("operativo", "trabajar")]);
  if (!v) notFound();
  const tecnicos = puedeCerrar
    ? (((await supabase.rpc("fn_tecnicos_asignables")).data ?? []) as { id: string; nombre: string }[])
    : [];
  return <VisitaCoordinador v={v} puedeCerrar={puedeCerrar} tecnicos={tecnicos} />;
}
