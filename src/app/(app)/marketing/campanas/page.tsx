import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { tienePermiso } from "@/lib/permisos";
import { Campanas, type Campana } from "./Campanas";

/** Campañas de Marketing (migración 125): agrupan ideas con un objetivo y un periodo. */
export default async function CampanasPage() {
  const supabase = await createClient();
  const [escribe, campRes, ideasRes] = await Promise.all([
    tienePermiso("marketing", "trabajar"),
    supabase.from("marketing_campanas").select("id, nombre, objetivo, publico, canales, fecha_inicio, fecha_fin, estado, notas").order("creado_en", { ascending: false }),
    supabase.from("marketing_ideas").select("campana_id, estado").not("campana_id", "is", null).neq("estado", "descartada"),
  ]);
  const cuenta = new Map<string, { total: number; publicadas: number }>();
  for (const i of (ideasRes.data ?? []) as { campana_id: string; estado: string }[]) {
    const c = cuenta.get(i.campana_id) ?? { total: 0, publicadas: 0 };
    c.total++;
    if (i.estado === "publicada") c.publicadas++;
    cuenta.set(i.campana_id, c);
  }
  return (
    <div className="mx-auto w-full max-w-3xl flex-1 space-y-3 p-4 sm:p-6">
      <Link href="/marketing" className="text-sm text-slate-600 underline">
        ← Marketing
      </Link>
      <h1 className="text-lg font-bold text-slate-900">Campañas</h1>
      {campRes.error ? (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">No se pudieron leer las campañas: {campRes.error.message}</p>
      ) : (
        <Campanas escribe={escribe} campanas={((campRes.data ?? []) as Omit<Campana, "ideas" | "publicadas">[]).map((c) => ({ ...c, ideas: cuenta.get(c.id)?.total ?? 0, publicadas: cuenta.get(c.id)?.publicadas ?? 0 }))} />
      )}
    </div>
  );
}
