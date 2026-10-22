import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAccesoRrhh } from "@/lib/supabase/rrhh-acceso";
import { FiltrosRrhh, MarcoRrhh } from "@/components/rrhh/FiltrosRrhh";
import { COLUMNAS_DOCUMENTO, type DocumentoPersonal } from "@/lib/rrhh-registros";
import { DocumentosRrhh } from "./DocumentosRrhh";

// Documentos con destinatario (migración 64): RRHH sube el desprendible, la liquidación o el
// contrato de UNA persona; le aparece solo a ella en "Documentos y certificados".
export default async function DocumentosRrhhPage({ searchParams }: { searchParams: Promise<{ persona?: string }> }) {
  const { persona } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/rrhh/documentos");
  const acceso = await getAccesoRrhh(supabase, user.id);

  if (!acceso.veTodo) {
    return (
      <MarcoRrhh titulo="Documentos del personal">
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Subir y ver documentos del personal requiere RRHH en nivel “trabajar”. Los tuyos están en Técnico → Mi perfil.
        </p>
      </MarcoRrhh>
    );
  }

  let q = supabase.from("documentos_personal").select(COLUMNAS_DOCUMENTO).order("subido_en", { ascending: false }).limit(300);
  if (persona) q = q.eq("persona_id", persona);
  const { data, error } = await q;

  return (
    <MarcoRrhh titulo="Documentos del personal" ayuda="Desprendibles, liquidaciones y contratos. Cada persona ve solo los suyos.">
      <FiltrosRrhh personas={acceso.personas} />
      {error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">No se pudieron leer los documentos: {error.message}</p>
      ) : (
        <DocumentosRrhh documentos={(data ?? []) as DocumentoPersonal[]} personas={acceso.personas} personaFiltro={persona ?? ""} />
      )}
    </MarcoRrhh>
  );
}
