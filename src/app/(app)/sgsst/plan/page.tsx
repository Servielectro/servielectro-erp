import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { tienePermiso } from "@/lib/permisos";
import { hoyColombia } from "@/lib/crm";
import { PlanTrabajo, type ItemPlan } from "./PlanTrabajo";

// Plan de trabajo (migración 75): estándar, responsable, fecha límite, evidencias y avance. Va
// VACÍO: los estándares los cargan Jhojan y la responsable SST (no se inventa la lista).
export default async function PlanPage() {
  const supabase = await createClient();
  const [itemsRes, evidRes, personalRes, formatosRes, trabaja, gestiona] = await Promise.all([
    supabase.from("sst_plan_items").select("id, estandar, descripcion, responsable_id, fecha_limite, avance, orden, archivado_en, motivo_archivo").order("orden").order("fecha_limite"),
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
  const items: ItemPlan[] = ((itemsRes.data ?? []) as Omit<ItemPlan, "evidencias">[]).map((i) => ({
    ...i,
    evidencias: evidencias.filter((e) => e.item_id === i.id).map((e) => ({ ...e, url: e.path ? (enlaces.get(e.path) ?? null) : null })),
  }));
  const personas = ((personalRes.data ?? []) as { perfil_id: string | null; nombre: string; estado_laboral: string }[])
    .filter((p) => p.perfil_id && p.estado_laboral !== "retirado")
    .map((p) => ({ id: p.perfil_id as string, nombre: p.nombre }));
  return (
    <div className="mx-auto w-full max-w-3xl flex-1 space-y-3 p-4 sm:p-6 lg:max-w-5xl">
      <Link href="/sgsst" className="text-sm text-slate-600 underline">
        ← SG-SST
      </Link>
      <h1 className="text-lg font-bold text-slate-900">Plan de trabajo SG-SST</h1>
      <p className="text-sm text-slate-600">
        Cada estándar con su responsable, su fecha límite, las evidencias que lo soportan y el avance. Los estándares los cargan la gestión y la responsable SST según
        los que le apliquen a la empresa.
      </p>
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
