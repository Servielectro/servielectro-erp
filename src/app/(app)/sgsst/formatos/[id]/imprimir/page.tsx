import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PrintButton } from "@/app/(app)/comercial/cotizaciones/[id]/imprimir/PrintButton";
import { leerFormato } from "@/lib/sst/formato-servidor";
import { VistaFormato } from "@/components/sst/VistaFormato";
import { tieneHojaPropia } from "@/components/sst/papel/HojaFormato";

// El formato en una hoja para imprimir o "Guardar como PDF", con las firmas, su registro y el sello.
export default async function ImprimirFormatoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const f = await leerFormato(await createClient(), id);
  if (!f) notFound();
  // Los que tienen hoja propia (FOR-14, FOR-15) van apaisados, como el papel.
  const ancho = tieneHojaPropia(f.plantilla.codigo) ? "max-w-[1060px]" : "max-w-3xl";
  return (
    <div className="min-h-screen bg-slate-100 px-2 pb-8 print:min-h-0 print:bg-white print:p-0">
      <div className={`mx-auto flex ${ancho} justify-end py-3 print:hidden`}>
        <PrintButton />
      </div>
      <div className={`mx-auto ${ancho} bg-white p-6 shadow print:max-w-none print:p-0 print:shadow-none`}>
        <p className="mb-2 text-xs font-semibold text-slate-500">Servielectro SAS · SG-SST</p>
        <VistaFormato f={f} imprimir />
      </div>
    </div>
  );
}
