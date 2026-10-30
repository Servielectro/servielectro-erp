import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { tienePermiso } from "@/lib/permisos";
import { IdeaDetalle, type IdeaCompleta, type MaterialBiblioteca, type Pieza, type Publicacion } from "./IdeaDetalle";

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
    supabase.from("marketing_piezas").select("id, orden, tipo, texto, path, biblioteca_id").eq("idea_id", id).order("orden"),
    supabase
      .from("marketing_biblioteca")
      .select("id, tipo, titulo, path, identificable, autorizacion, clientes(nombre)")
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

  // Miniaturas: un solo pedido de enlaces firmados (el bucket es privado).
  const paths = biblioteca.filter((b) => b.path && b.tipo !== "video").map((b) => b.path as string);
  const urls = new Map<string, string>();
  if (paths.length) {
    const { data } = await supabase.storage.from("marketing").createSignedUrls(paths, 3600);
    for (const e of data ?? []) if (e.path && e.signedUrl) urls.set(e.path, e.signedUrl);
  }

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 space-y-3 p-4 sm:p-6">
      <Link href="/marketing/ideas" className="text-sm text-slate-600 underline">
        ← Ideas
      </Link>
      <IdeaDetalle
        escribe={escribe}
        idea={ideaRes.data as unknown as IdeaCompleta}
        piezas={(piezasRes.data ?? []) as Pieza[]}
        biblioteca={biblioteca.map(({ clientes, ...b }) => ({ ...b, cliente: clientes?.nombre ?? null, url: b.path ? (urls.get(b.path) ?? null) : null }))}
        campanas={(campRes.data ?? []) as { id: string; nombre: string }[]}
        cuentas={(cuentasRes.data ?? []) as { id: string; canal: string; nombre: string }[]}
        publicaciones={(pubRes.data ?? []) as Publicacion[]}
      />
    </div>
  );
}
