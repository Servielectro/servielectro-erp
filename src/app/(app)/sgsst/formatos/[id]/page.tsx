import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { tienePermiso } from "@/lib/permisos";
import { leerFormato } from "@/lib/sst/formato-servidor";
import { VistaFormato } from "@/components/sst/VistaFormato";
import { AccionesFormato } from "./AccionesFormato";
import { DescartarBorrador } from "@/components/DescartarBorrador";

export default async function FormatoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const [f, gestiona, porQueNo] = await Promise.all([
    leerFormato(supabase, id),
    tienePermiso("sgsst", "responsable"),
    // Migración 92: null = se puede descartar. Sin la 92, error → no se ofrece.
    supabase.rpc("fn_formato_por_que_no_descartar", { p_formato_id: id }),
  ]);
  const descartable = !porQueNo.error && porQueNo.data === null;
  if (!f) notFound();
  if (f.ambito === "proyectos") redirect(`/proyectos/actas/${id}`);
  return (
    <div className="mx-auto w-full max-w-3xl flex-1 space-y-3 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href="/sgsst/formatos" className="text-sm text-slate-600 underline">
          ← Formatos
        </Link>
        <Link href={`/sgsst/formatos/${id}/imprimir`} className="inline-flex min-h-11 items-center rounded-md border border-slate-300 px-3 text-sm font-semibold">
          PDF / Imprimir
        </Link>
      </div>
      <VistaFormato f={f} />
      {descartable && <DescartarBorrador funcion="fn_descartar_formato" id={id} que="el formato" volverA="/sgsst/formatos" />}
      <AccionesFormato id={id} estado={f.estado} gestiona={gestiona} />
    </div>
  );
}
