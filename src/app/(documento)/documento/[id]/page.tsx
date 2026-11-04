import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { leerFormato } from "@/lib/sst/formato-servidor";
import { DocumentoFormato } from "@/components/sst/documento/DocumentoFormato";
import { BarraDocumento } from "./BarraDocumento";

/**
 * Vista previa de un formato como DOCUMENTO (A4, para revisar antes de firmar e imprimir a PDF).
 * Una sola ruta para los dos lados, sin el encabezado del ERP:
 *  - adentro, lo que la RLS deja ver por permiso del módulo;
 *  - el cliente, SOLO lo que fn_cliente_ve_formato le deja (migraciones 135/137): sus actas enviadas
 *    para firma o publicadas. Para cualquier otro formato leerFormato devuelve null → 404.
 * El documento solo pinta lo que está en el acta y sus firmas, igual para las dos partes.
 */
export default async function DocumentoPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ volver?: string; imprimir?: string }> }) {
  const { id } = await params;
  const { volver, imprimir } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/documento/${id}`);

  const { data: clienteId } = await supabase.rpc("fn_cliente_actual");
  const esCliente = !!clienteId;
  const f = await leerFormato(supabase, id);
  if (!f) notFound();

  if (esCliente) {
    // Lo que adentro sale de fn_proyectos_nombres y fn_sst_formato_integro, al cliente le llega por lo suyo.
    const { data: fp } = await supabase.from("sst_formatos").select("proyecto_id").eq("id", id).maybeSingle();
    const proyectoId = (fp as { proyecto_id: string | null } | null)?.proyecto_id;
    if (proyectoId && !f.proyecto) {
      const { data: p } = await supabase.from("v_cliente_mis_proyectos").select("codigo, nombre").eq("id", proyectoId).maybeSingle();
      const pr = p as { codigo: string | null; nombre: string } | null;
      if (pr) f.proyecto = pr.codigo ? `${pr.codigo} · ${pr.nombre}` : pr.nombre;
    }
    if (f.hash_contenido) {
      const integro = await supabase.rpc("fn_cliente_formato_integro", { p_formato_id: id });
      if (!integro.error && typeof integro.data === "boolean") f.integro = integro.data;
    }
  }

  // A dónde vuelve: solo rutas internas de la app (nada de //otro-sitio).
  const destino = volver && /^\/(?!\/)[\w\-/?=&.]*$/.test(volver) ? volver : esCliente ? "/cliente/firmas" : `/proyectos/actas/${id}`;
  const codigoObra = f.proyecto?.split(" · ")[0];

  return (
    <div className="min-h-screen bg-[#8a8f98] pb-8 print:min-h-0 print:bg-white print:p-0">
      {/* El título es el nombre sugerido al "Guardar como PDF". */}
      <title>{`${f.plantilla.nombre}${codigoObra ? ` · ${codigoObra}` : ""}`}</title>
      <BarraDocumento volver={destino} borrador={f.estado === "borrador"} autoImprimir={imprimir === "1"} />
      <DocumentoFormato f={f} />
    </div>
  );
}
