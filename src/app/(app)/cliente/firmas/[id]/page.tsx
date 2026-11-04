import Link from "next/link";
import { notFound } from "next/navigation";
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
  if (!fila || !user) notFound();
  const pf = fila as PorFirmarCliente;
  const f = await leerFormato(supabase, id);
  if (!f) notFound();

  // Integridad para el contratante (migración 138). Sin ella, error → se queda el "Firmado y sellado" sin afirmar más.
  if (f.hash_contenido) {
    const integro = await supabase.rpc("fn_cliente_formato_integro", { p_formato_id: id });
    if (!integro.error && typeof integro.data === "boolean") f.integro = integro.data;
  }
  const [perfilRes, enlaceRes, proyectoRes] = await Promise.all([
    // Su propio perfil y su propio enlace (las políticas solo le dejan leer los suyos).
    supabase.from("perfiles").select("nombre, cedula").eq("id", user.id).maybeSingle(),
    supabase.from("cliente_usuarios").select("cargo").eq("perfil_id", user.id).maybeSingle(),
    supabase.from("v_cliente_mis_proyectos").select("codigo, nombre").eq("id", pf.proyecto_id).maybeSingle(),
  ]);
  const proyecto = proyectoRes.data as { codigo: string | null; nombre: string } | null;
  if (proyecto) f.proyecto ??= proyecto.codigo ? `${proyecto.codigo} · ${proyecto.nombre}` : proyecto.nombre;
  const perfil = perfilRes.data as { nombre: string | null; cedula: string | null } | null;
  const yaFirmo = pf.ya_firmado || f.firmas.some((x) => x.rol === "sst_cliente");

  return (
    <div className="space-y-4">
      <Link href="/cliente/firmas" className="flex min-h-11 items-center text-sm text-slate-600">
        ← Documentos por firmar
      </Link>
      <p className="rounded-xl bg-blue-50 px-4 py-3 text-sm text-blue-900">Lee el acta completa. Al final está el botón para firmarla como contratante.</p>
      <VistaFormato f={f} paraCliente />
      <FirmarContratante
        formatoId={id}
        yaFirmo={yaFirmo}
        inicial={{
          nombre: perfil?.nombre ?? "",
          documento: perfil?.cedula ?? "",
          cargo: (enlaceRes.data as { cargo: string | null } | null)?.cargo ?? "",
        }}
      />
    </div>
  );
}
