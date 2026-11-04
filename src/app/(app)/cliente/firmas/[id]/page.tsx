import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { leerFormato } from "@/lib/sst/formato-servidor";
import { VistaFormato } from "@/components/sst/VistaFormato";
import { COLUMNAS_POR_FIRMAR_CLIENTE, type PorFirmarCliente } from "@/lib/cliente-portal";
import { FirmarContratante } from "./FirmarContratante";

// El acta completa para leerla y, debajo, la firma como CONTRATANTE (rol sst_cliente). La base solo
// le acepta ese rol, en sus actas y en borrador (políticas de la 134/135 y fn_sst_firma_reglas).
export default async function FirmarActaClientePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: fila } = await supabase.from("v_cliente_por_firmar").select(COLUMNAS_POR_FIRMAR_CLIENTE).eq("formato_id", id).maybeSingle();
  if (!user) notFound();
  if (!fila) {
    // Ya no está «por firmar»: si quedó firmada y publicada (cierre automático), su lugar es el
    // documento firmado. Así, al firmar, el cliente cae en su documento y no en un 404.
    const { data: pub } = await supabase.from("v_cliente_documentos").select("id").eq("formato_id", id).limit(1);
    if (pub?.length) redirect(`/cliente/documentos/formato/${id}?firmado=1`);
    notFound();
  }
  const pf = fila as PorFirmarCliente;
  const f = await leerFormato(supabase, id);
  if (!f) notFound();

  // Integridad para el contratante (migración 140). Sin ella, error → se queda el "Firmado y sellado" sin afirmar más.
  if (f.hash_contenido) {
    const integro = await supabase.rpc("fn_cliente_formato_integro", { p_formato_id: id });
    if (!integro.error && typeof integro.data === "boolean") f.integro = integro.data;
  }
  const [enlaceRes, proyectoRes] = await Promise.all([
    // Su propio enlace (la política solo le deja leer el suyo). El nombre de la CUENTA no se usa:
    // la cuenta es del conjunto y firma una persona.
    supabase.from("cliente_usuarios").select("cargo").eq("perfil_id", user.id).maybeSingle(),
    supabase.from("v_cliente_mis_proyectos").select("codigo, nombre").eq("id", pf.proyecto_id).maybeSingle(),
  ]);
  const proyecto = proyectoRes.data as { codigo: string | null; nombre: string } | null;
  if (proyecto) f.proyecto ??= proyecto.codigo ? `${proyecto.codigo} · ${proyecto.nombre}` : proyecto.nombre;
  // Precargado de lo que dice el acta (editable): quien firma suele ser el del acta, pero no siempre.
  const r = f.respuestas as Record<string, unknown>;
  const txt = (k: string) => (typeof r[k] === "string" ? (r[k] as string).trim() : "");
  const calidades = (f.plantilla.campos.find((c) => c.id === "contratante_calidad")?.opciones ?? ["Administrador", "Representante legal", "Delegado del consejo"]) as string[];
  const yaFirmo = pf.ya_firmado || f.firmas.some((x) => x.rol === "sst_cliente");

  return (
    <div className="space-y-4">
      <Link href="/cliente/firmas" className="flex min-h-11 items-center text-sm text-slate-600">
        ← Documentos por firmar
      </Link>
      <p className="rounded-xl bg-blue-50 px-4 py-3 text-sm text-blue-900">Lee el acta completa. Al final está el botón para firmarla como contratante.</p>
      <Link
        href={`/documento/${id}?volver=/cliente/firmas/${id}`}
        className="flex min-h-12 items-center justify-center rounded-xl border-2 border-slate-900 bg-white px-4 text-base font-semibold text-slate-900"
      >
        📄 Ver como documento (vista previa / PDF)
      </Link>

      <VistaFormato f={f} paraCliente />
      <FirmarContratante
        formatoId={id}
        yaFirmo={yaFirmo}
        calidades={calidades}
        inicial={{
          nombre: txt("contratante_nombre"),
          documento: txt("contratante_cedula"),
          cargo: txt("contratante_calidad") || ((enlaceRes.data as { cargo: string | null } | null)?.cargo ?? ""),
          empresa: txt("contratante_razon_social"),
        }}
      />
    </div>
  );
}
