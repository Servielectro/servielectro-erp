import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { tienePermiso } from "@/lib/permisos";
import { hoyColombia } from "@/lib/crm";
import { PlanTrabajo, type ItemPlan } from "./PlanTrabajo";
import { Tablero, type FilaEstandar, type TotalAutoevaluacion } from "./Tablero";

// Plan de trabajo: el tablero de los 60 estándares mínimos de la Res. 0312 (migraciones 108, 113 y
// 115), con la autoevaluación del artículo 27; y debajo, las tareas libres del plan (migración 75).
export default async function PlanPage() {
  const supabase = await createClient();
  const [itemsRes, evidRes, personalRes, formatosRes, trabaja, gestiona] = await Promise.all([
    supabase.from("sst_plan_items").select("id, codigo, estandar, descripcion, responsable_id, fecha_limite, avance, orden, archivado_en, motivo_archivo").order("orden").order("fecha_limite"),
    supabase.from("sst_plan_evidencias").select("id, item_id, descripcion, path, formato_id, subida_en, anulada_en, motivo_anulacion").order("subida_en"),
    supabase.rpc("fn_sst_personal"),
    supabase.from("sst_formatos").select("id, fecha, lugar, estado").eq("ambito", "sgsst").in("estado", ["firmado", "aprobado"]).order("fecha", { ascending: false }).limit(100),
    tienePermiso("sgsst", "trabajar"),
    tienePermiso("sgsst", "responsable"),
  ]);
  const evidencias = (evidRes.data ?? []) as ItemPlan["evidencias"];
  const rutas = evidencias.filter((e) => e.path).map((e) => e.path as string);
  const enlaces = new Map<string, string>();
  if (rutas.length) {
    const { data } = await supabase.storage.from("sgsst").createSignedUrls(rutas, 600);
    for (const x of data ?? []) if (x.path && x.signedUrl) enlaces.set(x.path, x.signedUrl);
  }
  const todos: (ItemPlan & { codigo: string | null })[] = ((itemsRes.data ?? []) as (Omit<ItemPlan, "evidencias"> & { codigo: string | null })[]).map((i) => ({
    ...i,
    evidencias: evidencias.filter((e) => e.item_id === i.id).map((e) => ({ ...e, url: e.path ? (enlaces.get(e.path) ?? null) : null })),
  }));
  const items = todos.filter((i) => !i.codigo);
  const porEstandar = Object.fromEntries(todos.filter((i) => i.codigo).map((i) => [i.id, i]));

  // Los estándares del año más reciente sembrado, su total y los códigos de plantilla para asociar.
  const [autoRes, totalRes, plantillasRes] = await Promise.all([
    supabase.from("v_sst_autoevaluacion").select("id, anio, codigo, ciclo, grupo, estandar, valor, aplica_7, calificacion, motivo_no_aplica, puntaje, evidencias, formatos_esperados").order("anio", { ascending: false }),
    supabase.from("v_sst_autoevaluacion_total").select("anio, puntaje, valoracion, estandares, pendientes").order("anio", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("sst_plantillas").select("codigo").eq("ambito", "sgsst").eq("estado", "publicada"),
  ]);
  const anio = ((totalRes.data as { anio: number } | null)?.anio) ?? null;
  const filas = ((autoRes.data ?? []) as FilaEstandar[])
    .filter((f) => f.anio === anio)
    .sort((a, b) => a.codigo.split(".").map((x) => x.padStart(3, "0")).join(".").localeCompare(b.codigo.split(".").map((x) => x.padStart(3, "0")).join(".")));
  const codigosPlantilla = [...new Set(((plantillasRes.data ?? []) as { codigo: string }[]).map((p) => p.codigo))].sort();

  const personas = ((personalRes.data ?? []) as { perfil_id: string | null; nombre: string; estado_laboral: string }[])
    .filter((p) => p.perfil_id && p.estado_laboral !== "retirado")
    .map((p) => ({ id: p.perfil_id as string, nombre: p.nombre }));
  return (
    <div className="mx-auto w-full max-w-3xl flex-1 space-y-3 p-4 sm:p-6 lg:max-w-5xl">
      <Link href="/sgsst" className="text-sm text-slate-600 underline">
        ← SG-SST
      </Link>
      <h1 className="text-lg font-bold text-slate-900">Plan de trabajo SG-SST{anio ? ` ${anio}` : ""}</h1>
      <p className="text-sm text-slate-600">Los estándares mínimos de la Resolución 0312 de 2019 por ciclo PHVA: calificación, evidencias y formatos que los soportan.</p>
      {autoRes.error ? (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">No se pudo leer la autoevaluación: {autoRes.error.message}</p>
      ) : filas.length > 0 ? (
        <Tablero
          filas={filas}
          total={(totalRes.data as TotalAutoevaluacion | null) ?? null}
          items={porEstandar}
          plantillas={codigosPlantilla}
          personas={personas}
          formatos={((formatosRes.data ?? []) as { id: string; fecha: string; lugar: string | null }[]).map((f) => ({ id: f.id, nombre: `${f.fecha}${f.lugar ? ` · ${f.lugar}` : ""}` }))}
          trabaja={trabaja}
          gestiona={gestiona}
          hoy={hoyColombia()}
        />
      ) : null}
      <h2 className="pt-2 text-sm font-bold text-slate-900">Otras tareas del plan</h2>
      {itemsRes.error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">No se pudo leer el plan: {itemsRes.error.message}</p>
      ) : (
        <PlanTrabajo
          items={items}
          personas={personas}
          formatos={((formatosRes.data ?? []) as { id: string; fecha: string; lugar: string | null }[]).map((f) => ({ id: f.id, nombre: `${f.fecha}${f.lugar ? ` · ${f.lugar}` : ""}` }))}
          trabaja={trabaja}
          gestiona={gestiona}
          hoy={hoyColombia()}
        />
      )}
    </div>
  );
}
