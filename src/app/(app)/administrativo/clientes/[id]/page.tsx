import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMisPermisos, tienePermiso } from "@/lib/permisos";
import { COLUMNAS_CLIENTE, COLUMNAS_SEDE, nitConDv, type ClienteFicha, type Sede } from "@/lib/clientes-dian";
import { fechaCorta } from "@/lib/rrhh-registros";
import { FichaCliente } from "../FichaCliente";
import { SedesCliente } from "../SedesCliente";
import { RutCliente, type RutDocumento } from "../RutCliente";
import { DocumentosCliente, type DocCargado, type ObraConDocs } from "../DocumentosCliente";

const COLUMNAS_DOC = "id, tipo, nombre, nombre_archivo, path, bytes, sha256, fecha_documento, origen, subido_en";

export default async function ClientePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const [clienteRes, sedesRes, rutsRes, edita, propiosRes, obrasRes, permisos] = await Promise.all([
    supabase.from("clientes").select(COLUMNAS_CLIENTE).eq("id", id).maybeSingle(),
    supabase.from("cliente_sedes").select(COLUMNAS_SEDE).eq("cliente_id", id).order("nombre"),
    supabase.from("documentos").select("id, nombre_archivo, storage_path, estado, subido_en").eq("cliente_id", id).eq("tipo_documento", "RUT").order("subido_en", { ascending: false }),
    Promise.all([tienePermiso("administrativo", "trabajar"), tienePermiso("comercial", "trabajar")]).then(([a, c]) => a || c),
    // Documentos del cliente (migración 101) y sus obras: si la 101 no está corrida, la consulta falla y no se sube.
    supabase.from("cliente_documentos").select(COLUMNAS_DOC).eq("cliente_id", id).eq("archivado", false).order("fecha_documento", { ascending: false, nullsFirst: false }),
    supabase.from("proyectos").select("id, codigo, nombre").eq("cliente_id", id).order("codigo", { ascending: false }),
    getMisPermisos(),
  ]);
  const obrasBase = (obrasRes.data ?? []) as { id: string; codigo: string | null; nombre: string }[];
  // Lo que la RLS deja ver (los reservados, solo con datos sensibles).
  const docsObraRes = obrasBase.length
    ? await supabase.from("proyecto_documentos").select(`${COLUMNAS_DOC}, proyecto_id, reservado`).in("proyecto_id", obrasBase.map((o) => o.id)).eq("archivado", false).order("fecha_documento", { ascending: false, nullsFirst: false })
    : { data: [] };
  const docsObra = (docsObraRes.data ?? []) as (DocCargado & { proyecto_id: string })[];
  const obras: ObraConDocs[] = obrasBase.map((o) => ({ ...o, documentos: docsObra.filter((d) => d.proyecto_id === o.id) }));
  const veSensibles = Boolean(permisos.comercial?.veDatosSensibles || permisos.proyectos?.veDatosSensibles);
  if (clienteRes.error) {
    return (
      <div className="mx-auto w-full max-w-3xl flex-1 p-4">
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">No se pudo leer el cliente: {clienteRes.error.message}</p>
      </div>
    );
  }
  const cliente = clienteRes.data as ClienteFicha | null;
  if (!cliente) notFound();

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 space-y-4 p-4 sm:p-6 lg:max-w-5xl">
      <div>
        <Link href="/administrativo/clientes" className="text-sm text-slate-600 underline">
          ← Clientes
        </Link>
        <h1 className="mt-2 text-lg font-bold text-slate-900">{cliente.nombre}</h1>
        <p className="text-sm text-slate-600">
          {cliente.nit ? `NIT ${nitConDv(cliente)}` : "Sin NIT"}
          {cliente.actualizado_desde_siigo_en ? ` · actualizado desde SIIGO el ${fechaCorta(cliente.actualizado_desde_siigo_en)}` : ""}
        </p>
      </div>
      <div className="space-y-4 lg:grid lg:grid-cols-[3fr_2fr] lg:items-start lg:gap-4 lg:space-y-0">
        <FichaCliente cliente={cliente} edita={edita} />
        <div className="space-y-4">
          <RutCliente clienteId={cliente.id} ruts={(rutsRes.data ?? []) as RutDocumento[]} sube={edita} />
          <DocumentosCliente
            clienteId={cliente.id}
            propios={(propiosRes.data ?? []) as DocCargado[]}
            obras={obras}
            sube={edita}
            veSensibles={veSensibles}
            sinTabla={!!propiosRes.error}
          />
          <SedesCliente clienteId={cliente.id} sedes={(sedesRes.data ?? []) as Sede[]} edita={edita} />
        </div>
      </div>
    </div>
  );
}
