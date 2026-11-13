import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { tienePermiso } from "@/lib/permisos";
import { IdeaDetalle, type IdeaCompleta, type MaterialBiblioteca, type Pieza, type Publicacion } from "./IdeaDetalle";
import type { Medicion } from "../../Mediciones";

// Redactar los prompts puede pasar por OpenAI, Gemini y un reintento.
export const maxDuration = 300;

/** La ficha de una idea (migración 125): guion, piezas, estado y dónde se publicó. */
export default async function IdeaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const [escribe, ideaRes, piezasRes, bibRes, campRes, cuentasRes, pubRes] = await Promise.all([
    tienePermiso("marketing", "trabajar"),
    supabase
      .from("marketing_ideas")
      .select(
        "id, titulo, tipo, canales, campana_id, estado, fecha_programada, gancho, guion, llamado_accion, notas, motivo_descarte, aprobada_en, origen_proyecto_id, origen_visita_id, origen_formato_id, proyectos(codigo, nombre), visitas(titulo, cliente_nombre)",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase.from("marketing_piezas").select("id, orden, tipo, texto, path, biblioteca_id, prompt, modelo, generada_por").eq("idea_id", id).order("orden"),
    supabase
      .from("marketing_biblioteca")
      .select("id, tipo, titulo, path, identificable, autorizacion, archivada, clientes(nombre)")
      .eq("archivada", false)
      .order("subido_en", { ascending: false })
      .limit(300),
    supabase.from("marketing_campanas").select("id, nombre").order("nombre"),
    supabase.from("marketing_cuentas").select("id, canal, nombre").eq("activa", true).order("canal"),
    supabase.from("marketing_publicaciones").select("id, cuenta_id, publicado_en, url, via").eq("idea_id", id).order("publicado_en"),
  ]);
  if (!ideaRes.data) {
    if (ideaRes.error) return <p className="m-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">No se pudo leer la idea: {ideaRes.error.message}</p>;
    notFound();
  }
  const biblioteca = (bibRes.data ?? []) as unknown as (Omit<MaterialBiblioteca, "url" | "cliente"> & { clientes: { nombre: string } | null })[];

  // Material que usa la idea y no vino arriba (archivado o más allá del límite). Sin esto, archivar
  // una foto sin autorización hacía desaparecer el bloqueo de la pantalla.
  const piezasIdea = (piezasRes.data ?? []) as Pieza[];
  const cargados = new Set(biblioteca.map((b) => b.id));
  const faltan = [...new Set(piezasIdea.map((p) => p.biblioteca_id).filter((x): x is string => !!x && !cargados.has(x)))];
  if (faltan.length) {
    const { data } = await supabase.from("marketing_biblioteca").select("id, tipo, titulo, path, identificable, autorizacion, archivada, clientes(nombre)").in("id", faltan);
    biblioteca.push(...((data ?? []) as unknown as typeof biblioteca));
  }

  // Miniaturas: un solo pedido de enlaces firmados (el bucket es privado).
  const paths = biblioteca.filter((b) => b.path && b.tipo !== "video").map((b) => b.path as string);
  const urls = new Map<string, string>();
  if (paths.length) {
    const { data } = await supabase.storage.from("marketing").createSignedUrls(paths, 3600);
    for (const e of data ?? []) if (e.path && e.signedUrl) urls.set(e.path, e.signedUrl);
  }

  const pubs = (pubRes.data ?? []) as Omit<Publicacion, "mediciones">[];
  const medRes = pubs.length
    ? await supabase.from("marketing_metricas").select("publicacion_id, medida_en, alcance, impresiones, interacciones, clics, guardados, comentarios").in("publicacion_id", pubs.map((p) => p.id))
    : { data: [] };
  const medicionesDe = (id: string) => ((medRes.data ?? []) as (Medicion & { publicacion_id: string })[]).filter((m) => m.publicacion_id === id);

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 space-y-3 p-4 sm:p-6">
      <Link href="/marketing/ideas" className="text-sm text-slate-600 underline">
        ← Ideas
      </Link>
      <IdeaDetalle
        escribe={escribe}
        idea={ideaRes.data as unknown as IdeaCompleta}
        piezas={piezasIdea}
        biblioteca={biblioteca.map(({ clientes, ...b }) => ({ ...b, cliente: clientes?.nombre ?? null, url: b.path ? (urls.get(b.path) ?? null) : null }))}
        campanas={(campRes.data ?? []) as { id: string; nombre: string }[]}
        cuentas={(cuentasRes.data ?? []) as { id: string; canal: string; nombre: string }[]}
        publicaciones={pubs.map((p) => ({ ...p, mediciones: medicionesDe(p.id) }))}
      />
    </div>
  );
}
