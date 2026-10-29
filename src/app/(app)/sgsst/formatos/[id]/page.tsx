import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { tienePermiso } from "@/lib/permisos";
import { leerFormato } from "@/lib/sst/formato-servidor";
import { VistaFormato } from "@/components/sst/VistaFormato";
import { AccionesFormato } from "./AccionesFormato";
import { DescartarBorrador } from "@/components/DescartarBorrador";
import { SeguirEditando } from "@/components/sst/SeguirEditando";

export default async function FormatoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const [f, gestiona, porQueNo, trabaja, conFirmas] = await Promise.all([
    leerFormato(supabase, id),
    tienePermiso("sgsst", "responsable"),
    // Migración 92: null = se puede descartar. Sin la 92, error → no se ofrece.
    supabase.rpc("fn_formato_por_que_no_descartar", { p_formato_id: id }),
    tienePermiso("sgsst", "trabajar"),
    supabase.rpc("fn_sst_formato_tiene_firmas", { p_formato_id: id }),
  ]);
  const descartable = !porQueNo.error && porQueNo.data === null;
  if (!f) notFound();
  // Un acta de Proyectos: a su pantalla de Proyectos, o a la de SG-SST si no se tiene Proyectos (105).
  if (f.ambito === "proyectos") redirect((await tienePermiso("proyectos", "consultar")) ? `/proyectos/actas/${id}` : `/sgsst/actas-obra/${id}`);
  const editable = trabaja && f.estado === "borrador" && !conFirmas.error && conFirmas.data === false && f.firmas.length === 0;
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
      {editable && <SeguirEditando href={`/sgsst/campo?formato=${id}`} />}
      <VistaFormato f={f} />
      {descartable && <DescartarBorrador funcion="fn_descartar_formato" id={id} que="el formato" volverA="/sgsst/formatos" />}
      <AccionesFormato id={id} estado={f.estado} gestiona={gestiona} />
    </div>
  );
}
