import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PrintButton } from "@/app/(app)/comercial/cotizaciones/[id]/imprimir/PrintButton";
import { leerFormato } from "@/lib/sst/formato-servidor";
import { VistaFormato } from "@/components/sst/VistaFormato";

// El acta en una hoja para imprimir o "Guardar como PDF", con las firmas, su registro y el sello.
export default async function ImprimirActaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const f = await leerFormato(await createClient(), id);
  if (!f || f.ambito !== "proyectos") notFound();
  return (
    <div className="min-h-screen bg-slate-100 px-2 pb-8 print:min-h-0 print:bg-white print:p-0">
      <div className="mx-auto flex max-w-3xl justify-end py-3 print:hidden">
        <PrintButton />
      </div>
      <div className="mx-auto max-w-3xl bg-white p-6 shadow print:max-w-none print:p-0 print:shadow-none">
        <p className="mb-2 text-xs font-semibold text-slate-500">Servielectro SAS · {f.proyecto ?? "Proyecto"}</p>
        <VistaFormato f={f} imprimir />
      </div>
    </div>
  );
}
