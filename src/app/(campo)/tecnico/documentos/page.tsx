import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requierePermiso } from "@/lib/permisos";
import { PantallaPerfil } from "@/components/rrhh/PantallaPerfil";
import { COLUMNAS_DOCUMENTO, type DocumentoPersonal } from "@/lib/rrhh-registros";
import { DocumentosTecnico } from "./DocumentosTecnico";

// "Documentos y certificados" (migración 64): desprendibles, liquidaciones y demás que sube
// RRHH para esta persona. Jhojan: "que no se vea el uno con el otro, sino que únicamente los
// vea el técnico al que le pertenezca". Lo garantiza la base (RLS de documentos_personal y del
// bucket); acá además se filtra por el id de quien abre la pantalla.
export default async function DocumentosPage() {
  await requierePermiso("tecnico", "trabajar");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/tecnico/documentos");

  const { data, error } = await supabase
    .from("documentos_personal")
    .select(COLUMNAS_DOCUMENTO)
    .eq("persona_id", user.id)
    .is("anulado_en", null)
    .order("subido_en", { ascending: false })
    .limit(100);

  return (
    <PantallaPerfil titulo="Documentos y certificados" ayuda="Tus desprendibles y documentos de RRHH. Solo los ves tú.">
      {error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">No se pudieron leer tus documentos: {error.message}</p>
      ) : (
        <DocumentosTecnico yo={user.id} documentos={(data ?? []) as DocumentoPersonal[]} />
      )}
    </PantallaPerfil>
  );
}
