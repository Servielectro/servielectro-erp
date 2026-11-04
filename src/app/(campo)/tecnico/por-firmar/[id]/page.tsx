import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PantallaPerfil } from "@/components/rrhh/PantallaPerfil";
import { COLUMNAS_LECTURA, type Lectura, type Material } from "@/lib/sst/materiales";
import { COLUMNAS_POR_FIRMAR, type PorFirmar } from "@/lib/sst/por-firmar";
import type { Campo } from "@/lib/sst/plantillas";
import { FirmarConvocado } from "./FirmarConvocado";

// Un formato al que convocaron a este usuario (migración 131). Su nombre y cédula salen de la
// convocatoria (los escribió SG-SST); la base solo le deja firmar con esa cédula y como participante.
export default async function FirmarPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/tecnico/por-firmar/${id}`);

  const { data: fila } = await supabase.from("v_mis_documentos_por_firmar").select(COLUMNAS_POR_FIRMAR).eq("formato_id", id).maybeSingle();
  if (!fila) notFound();
  const yo = fila as PorFirmar;

  const { data: formato } = await supabase.from("sst_formatos").select("id, plantilla_id, respuestas").eq("id", id).maybeSingle();
  if (!formato) notFound();
  const f = formato as { id: string; plantilla_id: string; respuestas: Record<string, unknown> | null };
  const [plantillaRes, exigidosRes, lecturasRes] = await Promise.all([
    supabase.from("sst_plantillas").select("campos").eq("id", f.plantilla_id).maybeSingle(),
    supabase.from("sst_plantilla_materiales").select("codigo, obligatorio").eq("plantilla_id", f.plantilla_id),
    // Solo las suyas (política leido_por = auth.uid()).
    supabase.from("sst_material_lecturas").select(COLUMNAS_LECTURA).eq("formato_id", id).eq("leido_por", user.id).order("abierto_en"),
  ]);
  const exigidos = (exigidosRes.data ?? []) as { codigo: string; obligatorio: boolean }[];
  const publicadosRes = exigidos.length
    ? await supabase.from("sst_materiales").select("id, codigo, nombre, version, path, minutos_lectura").eq("estado", "publicado").in("codigo", exigidos.map((e) => e.codigo))
    : { data: [] };
  const materiales: Material[] = ((publicadosRes.data ?? []) as Omit<Material, "obligatorio">[]).map((m) => ({
    ...m,
    obligatorio: exigidos.find((e) => e.codigo === m.codigo)?.obligatorio ?? true,
  }));
  const sinPublicar = exigidos.filter((e) => !materiales.some((m) => m.codigo === e.codigo)).map((e) => e.codigo);

  return (
    <PantallaPerfil titulo={yo.tema || yo.formato} ayuda={`${yo.codigo} · ${yo.fecha}${yo.lugar ? ` · ${yo.lugar}` : ""}`}>
      <FirmarConvocado
        formatoId={id}
        yo={{ nombre: yo.mi_nombre, documento: yo.mi_documento, cargo: yo.mi_cargo ?? "" }}
        yaFirme={yo.ya_firme}
        campos={((plantillaRes.data as { campos: Campo[] } | null)?.campos ?? []) as Campo[]}
        respuestas={f.respuestas ?? {}}
        materiales={materiales}
        materialesSinPublicar={sinPublicar}
        lecturasIniciales={(lecturasRes.data ?? []) as Lectura[]}
      />
    </PantallaPerfil>
  );
}
