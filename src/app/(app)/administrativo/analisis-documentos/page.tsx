import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { tienePermiso } from "@/lib/permisos";
import { comparar, lecturaDesdeConfirmado, type LecturaContrato } from "@/lib/documentos/lectura-contrato";
import { Analisis, type DocOpcion, type LadoAnalisis } from "./Analisis";

// La lectura de un escaneado de 20 páginas puede pasar del minuto (la acción corre en esta página).
export const maxDuration = 300;

/**
 * Análisis de documentos (pedido de Jhojan: "un cuadro de análisis de documentos en
 * administrativo, como ayuda de gestión de documentos"). Se eligen dos documentos de obra y se
 * comparan campo por campo: lo que se ENVIÓ contra lo que se FIRMÓ. Los documentos y sus lecturas
 * salen con la RLS de cada uno (migraciones 90 y 102): quien no ve los documentos de la obra no
 * los ve aquí, aunque entre a Administrativo.
 */
export default async function AnalisisDocumentosPage({ searchParams }: { searchParams: Promise<{ a?: string; b?: string; todos?: string }> }) {
  const { a, b, todos } = await searchParams;
  const supabase = await createClient();
  let consulta = supabase
    .from("proyecto_documentos")
    .select("id, proyecto_id, tipo, nombre, nombre_archivo, mime, fecha_documento, proyectos(codigo, nombre)")
    .eq("archivado", false)
    .order("subido_en", { ascending: false });
  if (!todos) consulta = consulta.in("tipo", ["contrato_borrador", "contrato_firmado"]);
  const [docsRes, puedeLeer] = await Promise.all([
    consulta,
    Promise.all([tienePermiso("comercial", "trabajar"), tienePermiso("proyectos", "trabajar")]).then(([c, p]) => c || p),
  ]);
  const docs: DocOpcion[] = ((docsRes.data ?? []) as unknown as (Omit<DocOpcion, "obra"> & { proyectos: { codigo: string | null; nombre: string } | null })[]).map((d) => ({
    id: d.id,
    proyecto_id: d.proyecto_id,
    tipo: d.tipo,
    nombre: d.nombre,
    nombre_archivo: d.nombre_archivo,
    mime: d.mime,
    fecha_documento: d.fecha_documento,
    obra: d.proyectos ? `${d.proyectos.codigo ?? ""} ${d.proyectos.nombre}`.trim() : "Sin obra",
  }));

  // Obras con los dos contratos: el atajo "comparar enviado contra firmado".
  const parejas = Object.values(
    docs.reduce<Record<string, { obra: string; enviado?: string; firmado?: string }>>((acc, d) => {
      const x = (acc[d.proyecto_id] ??= { obra: d.obra });
      if (d.tipo === "contrato_borrador" && !x.enviado) x.enviado = d.id;
      if (d.tipo === "contrato_firmado" && !x.firmado) x.firmado = d.id;
      return acc;
    }, {}),
  ).filter((p) => p.enviado && p.firmado);

  async function lado(id: string | undefined): Promise<LadoAnalisis | null> {
    if (!id) return null;
    const doc = docs.find((d) => d.id === id) ?? null;
    if (!doc) return null;
    const [lecRes, conRes] = await Promise.all([
      supabase.from("documento_lecturas").select("lectura, proveedor, modelo, leido_en").eq("documento_id", id).order("leido_en", { ascending: false }).limit(1).maybeSingle(),
      doc.tipo === "contrato_firmado"
        ? supabase
            .from("proyecto_contratos")
            .select("valor_total, forma_pago, plazo_cantidad, plazo_unidad, plazo_inicia, plazo_inicia_detalle, multa_diaria, multa_unidad, multa_tope_pct, garantias, polizas_exigidas, confirmado_en")
            .eq("documento_id", id)
            .eq("estado", "confirmado")
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);
    const l = lecRes.data as { lectura: LecturaContrato; proveedor: string; modelo: string; leido_en: string } | null;
    const confirmado = conRes.data as (Parameters<typeof lecturaDesdeConfirmado>[0] & { confirmado_en: string }) | null;
    return {
      doc,
      lectura: confirmado ? lecturaDesdeConfirmado(confirmado, l?.lectura ?? null) : (l?.lectura ?? null),
      fuente: confirmado
        ? `Contrato confirmado el ${new Date(confirmado.confirmado_en).toLocaleDateString("es-CO")}${l ? " (prórrogas, plazo de pago y cláusulas: de la lectura)" : ""}`
        : l
          ? `Lectura de la IA (${l.proveedor}, ${new Date(l.leido_en).toLocaleString("es-CO", { timeZone: "America/Bogota", dateStyle: "medium", timeStyle: "short" })}): revisa contra el documento`
          : null,
      sinMigracion: !!lecRes.error,
    };
  }
  const [ladoA, ladoB] = await Promise.all([lado(a), lado(b)]);
  const filas = ladoA?.lectura && ladoB?.lectura ? comparar(ladoA.lectura, ladoB.lectura) : null;

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 space-y-4 p-4 sm:p-6 lg:max-w-6xl">
      <div>
        <Link href="/administrativo" className="text-sm text-slate-600 underline">
          ← Administrativo
        </Link>
        <h1 className="mt-2 text-lg font-bold text-slate-900">Análisis de documentos</h1>
        <p className="text-sm text-slate-600">
          Compara lo que se envió con lo que volvió firmado: qué cambió la contraparte. Lo que cambió sale en rojo.
        </p>
      </div>
      {docsRes.error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">No se pudieron leer los documentos: {docsRes.error.message}</p>}
      <Analisis
        docs={docs}
        parejas={parejas.map((p) => ({ obra: p.obra, a: p.enviado!, b: p.firmado! }))}
        a={ladoA}
        b={ladoB}
        filas={filas}
        todos={!!todos}
        puedeLeer={puedeLeer}
      />
    </div>
  );
}
