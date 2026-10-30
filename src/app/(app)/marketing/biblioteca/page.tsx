import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { tienePermiso } from "@/lib/permisos";
import { Biblioteca, type Material } from "./Biblioteca";

/**
 * La biblioteca de material de Marketing (migración 125). Cada foto dice si se reconoce de quién es
 * la obra y si el cliente autorizó: sin eso, ninguna idea que la use pasa a "aprobada".
 */
export default async function BibliotecaPage({ searchParams }: { searchParams: Promise<{ archivadas?: string }> }) {
  const { archivadas } = await searchParams;
  const supabase = await createClient();
  const [{ data: auth }, escribe, matRes, clientesRes] = await Promise.all([
    supabase.auth.getUser(),
    tienePermiso("marketing", "trabajar"),
    supabase
      .from("marketing_biblioteca")
      .select("id, tipo, titulo, descripcion, path, cliente_id, etiquetas, tomada_en, identificable, autorizacion, autorizacion_nota, autorizada_en, archivada, subido_en, clientes(nombre)")
      .eq("archivada", archivadas === "1")
      .order("subido_en", { ascending: false })
      .limit(500),
    supabase.from("clientes").select("id, nombre").order("nombre").limit(3000),
  ]);
  const materiales = (matRes.data ?? []) as unknown as (Omit<Material, "url" | "cliente"> & { clientes: { nombre: string } | null })[];
  const paths = materiales.filter((x) => x.path && x.tipo !== "video").map((x) => x.path as string);
  const urls = new Map<string, string>();
  if (paths.length) {
    const { data } = await supabase.storage.from("marketing").createSignedUrls(paths, 3600);
    for (const e of data ?? []) if (e.path && e.signedUrl) urls.set(e.path, e.signedUrl);
  }

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 space-y-3 p-4 sm:p-6 lg:max-w-6xl">
      <Link href="/marketing" className="text-sm text-slate-600 underline">
        ← Marketing
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h1 className="text-lg font-bold text-slate-900">Biblioteca de fotos</h1>
        <Link href={archivadas === "1" ? "/marketing/biblioteca" : "/marketing/biblioteca?archivadas=1"} className="text-sm text-slate-600 underline">
          {archivadas === "1" ? "Ver las vigentes" : "Ver archivadas"}
        </Link>
      </div>
      {matRes.error ? (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">No se pudo leer la biblioteca: {matRes.error.message}</p>
      ) : (
        <Biblioteca
          yo={auth.user?.id ?? ""}
          escribe={escribe}
          archivadas={archivadas === "1"}
          clientes={(clientesRes.data ?? []) as { id: string; nombre: string }[]}
          materiales={materiales.map(({ clientes, ...x }) => ({ ...x, cliente: clientes?.nombre ?? null, url: x.path ? (urls.get(x.path) ?? null) : null }))}
        />
      )}
    </div>
  );
}
