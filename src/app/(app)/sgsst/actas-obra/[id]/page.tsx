import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { leerFormato } from "@/lib/sst/formato-servidor";
import { VistaFormato } from "@/components/sst/VistaFormato";

// Un acta de obra vista desde SG-SST (migración 105): solo lectura, con sus firmas, fotos y sello.
export default async function ActaDeObraSgsstPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const f = await leerFormato(await createClient(), id);
  if (!f || f.ambito !== "proyectos") notFound();
  return (
    <div className="mx-auto w-full max-w-3xl flex-1 space-y-3 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href="/sgsst/actas-obra" className="text-sm text-slate-600 underline">
          ← Actas de obra
        </Link>
        <Link href={`/sgsst/actas-obra/${id}/imprimir`} className="inline-flex min-h-11 items-center rounded-md border border-slate-300 px-3 text-sm font-semibold">
          PDF / Imprimir
        </Link>
      </div>
      <VistaFormato f={f} />
    </div>
  );
}
