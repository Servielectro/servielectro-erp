import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { leerFormato } from "@/lib/sst/formato-servidor";
import { VistaFormato } from "@/components/sst/VistaFormato";

// Un formato firmado que le PUBLICARON al cliente. Primero se confirma que está en
// v_cliente_documentos (publicado y no retirado); la RLS de la 135 (fn_cliente_ve_formato) lo exige
// igual al leer sst_formatos.
export default async function FormatoPublicadoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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
      <Link
        href={`/documento/${id}?volver=/cliente/documentos/formato/${id}`}
        className="flex min-h-12 items-center justify-center rounded-xl border-2 border-slate-900 bg-white px-4 text-base font-semibold text-slate-900"
      >
        📄 Ver como documento (vista previa / PDF)
      </Link>
      <VistaFormato f={f} paraCliente />
    </div>
  );
}
