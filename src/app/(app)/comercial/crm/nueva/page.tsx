import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PIPELINE_LABEL, type TipoPipeline } from "@/lib/crm";
import { NuevaOportunidadForm } from "./NuevaOportunidadForm";

export default async function NuevaOportunidadPage(props: PageProps<"/comercial/crm/nueva">) {
  const { p } = await props.searchParams;
  const tipo: TipoPipeline = p === "renovacion" ? "renovacion" : "proyecto_nuevo";

  const supabase = await createClient();
  const { data } = await supabase
    .from("clientes")
    .select("id, nombre")
    .eq("activo", true)
    .order("nombre");

  return (
    <div className="mx-auto w-full max-w-md flex-1 p-4 sm:p-6">
      <Link
        href={tipo === "renovacion" ? "/comercial/crm?p=renovacion" : "/comercial/crm"}
        className="mb-2 inline-block text-sm text-slate-600"
      >
        ← Pipeline
      </Link>
      <h1 className="mb-1 text-center text-sm font-bold text-slate-900 sm:text-base">Nuevo negocio</h1>
      <p className="mb-4 text-center text-xs text-slate-500">
        {PIPELINE_LABEL[tipo]} · entra en {tipo === "renovacion" ? "Renovación próxima" : "Solicitud"}
      </p>
      <NuevaOportunidadForm tipo={tipo} clientes={(data ?? []) as { id: string; nombre: string }[]} />
    </div>
  );
}
