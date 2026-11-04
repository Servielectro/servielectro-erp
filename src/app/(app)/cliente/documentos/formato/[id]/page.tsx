import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { leerFormato } from "@/lib/sst/formato-servidor";
import { VistaFormato } from "@/components/sst/VistaFormato";

// Un formato firmado que le PUBLICARON al cliente. Primero se confirma que está en
// v_cliente_documentos (publicado y no retirado); la RLS de la 135 (fn_cliente_ve_formato) lo exige
// igual al leer sst_formatos.
export default async function FormatoPublicadoPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ firmado?: string }> }) {
  const { id } = await params;
  const { firmado } = await searchParams;
  const supabase = await createClient();
  const { data: pub } = await supabase.from("v_cliente_documentos").select("titulo, proyecto_codigo, proyecto_nombre").eq("formato_id", id).limit(1).maybeSingle();
  if (!pub) notFound();
  const f = await leerFormato(supabase, id);
  if (!f) notFound();
  // Integridad para el contratante (migración 140). Sin ella, error → se queda el "Firmado y sellado" sin afirmar más.
  if (f.hash_contenido) {
    const integro = await supabase.rpc("fn_cliente_formato_integro", { p_formato_id: id });
    if (!integro.error && typeof integro.data === "boolean") f.integro = integro.data;
  }
  const p = pub as { titulo: string; proyecto_codigo: string | null; proyecto_nombre: string };
  // El nombre de la obra sale de la vista del cliente (fn_proyectos_nombres no le responde).
  f.proyecto ??= p.proyecto_codigo ? `${p.proyecto_codigo} · ${p.proyecto_nombre}` : p.proyecto_nombre;

  return (
    <div className="space-y-3">
      <Link href="/cliente/documentos" className="flex min-h-11 items-center text-sm text-slate-600">
        ← Documentos
      </Link>
      {firmado && f.estado !== "borrador" && (
        <div className="rounded-xl border-2 border-green-600 bg-green-50 px-4 py-3 text-green-900">
          <p className="text-lg font-bold">✓ Listo: firmaste y el acta quedó firmada y sellada</p>
          <p className="text-sm">Aquí está tu documento firmado. Queda guardado en «Documentos» de tu portal.</p>
        </div>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        <Link
          href={`/documento/${id}?volver=/cliente/documentos/formato/${id}`}
          className="flex min-h-12 items-center justify-center rounded-xl bg-slate-900 px-4 text-base font-semibold text-white"
        >
          📄 Ver el documento
        </Link>
        <Link
          href={`/documento/${id}?volver=/cliente/documentos/formato/${id}&imprimir=1`}
          className="flex min-h-12 items-center justify-center rounded-xl border-2 border-slate-900 bg-white px-4 text-base font-semibold text-slate-900"
        >
          ⬇ Descargar PDF
        </Link>
      </div>
      <VistaFormato f={f} paraCliente />
    </div>
  );
}
