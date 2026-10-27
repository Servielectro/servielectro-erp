import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { tienePermiso } from "@/lib/permisos";
import { hoyColombia } from "@/lib/crm";
import { estadoPlazo, type Plazo } from "@/lib/sst/plazos";
import { NuevoEvento } from "./NuevoEvento";

export default async function EventosPage() {
  const supabase = await createClient();
  const [{ data, error }, plazosRes, personalRes, trabaja] = await Promise.all([
    supabase.from("sst_eventos").select("id, tipo, ocurrido_en, lugar, empleado_id, afectado_nombre, descripcion, estado, reportado_arl_en, reportado_eps_en").order("ocurrido_en", { ascending: false }).limit(200),
    supabase.rpc("fn_sst_plazos"),
    supabase.rpc("fn_sst_personal"),
    tienePermiso("sgsst", "trabajar"),
  ]);
  const plazos = new Map(((plazosRes.data ?? []) as Plazo[]).map((p) => [p.clave, p]));
  const personal = (personalRes.data ?? []) as { id: string; nombre: string; estado_laboral: string }[];
  const nombre = new Map(personal.map((p) => [p.id, p.nombre]));
  const hoy = hoyColombia();
  const eventos = (data ?? []) as { id: string; tipo: string; ocurrido_en: string; lugar: string | null; empleado_id: string | null; afectado_nombre: string | null; descripcion: string; estado: string; reportado_arl_en: string | null; reportado_eps_en: string | null }[];
  const sinPlazos = !plazos.get("plazo_reporte_arl")?.dias;
  return (
    <div className="mx-auto w-full max-w-3xl flex-1 space-y-3 p-4 sm:p-6 lg:max-w-5xl">
      <Link href="/sgsst" className="text-sm text-slate-600 underline">
        ← SG-SST
      </Link>
      <h1 className="text-lg font-bold text-slate-900">Accidentes e incidentes</h1>
      <p className="text-sm text-slate-600">Se registra qué pasó, a quién, el reporte a la ARL y la EPS, y la investigación. Nunca diagnósticos ni datos de salud.</p>
      {sinPlazos && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Los plazos de reporte todavía no están configurados: los carga la responsable SST en <Link href="/sgsst/plazos" className="underline">Plazos de reporte</Link>. Mientras tanto no se cuentan días.
        </p>
      )}
      {trabaja && <NuevoEvento personal={personal.filter((p) => p.estado_laboral !== "retirado").map((p) => ({ id: p.id, nombre: p.nombre }))} />}
      {error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">No se pudieron leer: {error.message}</p>
      ) : eventos.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-600">No hay accidentes ni incidentes registrados.</p>
      ) : (
        <ul className="space-y-2">
          {eventos.map((e) => {
            const arl = e.tipo === "accidente" ? estadoPlazo(plazos.get("plazo_reporte_arl"), e.ocurrido_en, e.reportado_arl_en, hoy) : null;
            return (
              <li key={e.id}>
                <Link href={`/sgsst/eventos/${e.id}`} className="block rounded-lg border border-slate-200 bg-white p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-slate-900">
                      {e.tipo === "accidente" ? "Accidente" : "Incidente"} · {e.empleado_id ? nombre.get(e.empleado_id) ?? "Empleado" : e.afectado_nombre ?? "sin afectado"}
                    </p>
                    <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold">{e.estado}</span>
                  </div>
                  <p className="text-xs text-slate-600">
                    {new Date(e.ocurrido_en).toLocaleString("es-CO")} · {e.lugar ?? "sin lugar"}
                  </p>
                  <p className="line-clamp-2 text-sm text-slate-700">{e.descripcion}</p>
                  {arl?.tipo === "pendiente" && (
                    <p className={`text-xs font-semibold ${arl.vencido ? "text-red-800" : "text-amber-800"}`}>
                      Reporte a la ARL: {arl.vencido ? `vencido desde el ${arl.limite}` : `vence el ${arl.limite} (${arl.diasRestantes} días)`}
                    </p>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
