import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getEtapas, getOportunidadDetalle } from "@/lib/supabase/crm";
import { OportunidadVista } from "./OportunidadVista";

export default async function OportunidadPage(props: PageProps<"/comercial/crm/[id]">) {
  const { id } = await props.params;
  const supabase = await createClient();
  const [oportunidad, etapas] = await Promise.all([
    getOportunidadDetalle(supabase, id),
    getEtapas(supabase),
  ]);
  if (!oportunidad) notFound();

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 p-4 sm:p-6">
      <Link
        href={oportunidad.tipoPipeline === "renovacion" ? "/comercial/crm?p=renovacion" : "/comercial/crm"}
        className="mb-2 inline-block text-sm text-slate-600"
      >
        ← Pipeline
      </Link>
      <OportunidadVista
        o={oportunidad}
        etapas={etapas.filter((e) => e.tipoPipeline === oportunidad.tipoPipeline)}
        todasLasEtapas={etapas}
        ahora={oportunidad.consultadoEn}
      />
    </div>
  );
}
