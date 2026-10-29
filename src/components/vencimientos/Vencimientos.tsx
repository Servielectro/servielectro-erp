import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

// Lo que se vence (migraciones 119 y 122): una sola lista, leída de v_vencimientos, que es
// security_invoker: cada quien ve solo lo que ya podía ver. Días calendario.

export interface Vencimiento {
  origen_tabla: string;
  origen_id: string;
  categoria: string;
  titulo: string;
  detalle: string | null;
  vence: string;
  dias: number;
  estado: "vencido" | "hoy" | "por_vencer" | "vigente";
  modulo: string;
  ruta: string;
}

export const ESTADO_VENC = {
  vencido: { nombre: "Vencido", chip: "bg-red-100 text-red-800", borde: "border-red-300" },
  hoy: { nombre: "Vence hoy", chip: "bg-amber-100 text-amber-900", borde: "border-amber-300" },
  por_vencer: { nombre: "Por vencer", chip: "bg-amber-50 text-amber-800", borde: "border-slate-200" },
  vigente: { nombre: "Vigente", chip: "bg-green-100 text-green-800", borde: "border-slate-200" },
} as const;

export const NOMBRE_MODULO_VENC: Record<string, string> = {
  sgsst: "SG-SST",
  rrhh: "RRHH",
  administrativo: "Administrativo",
  proyectos: "Proyectos",
  operativo: "Tareas",
};

const fecha = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" });
export const cuando = (v: Pick<Vencimiento, "dias">) =>
  v.dias < 0 ? `venció hace ${-v.dias} día${v.dias === -1 ? "" : "s"}` : v.dias === 0 ? "vence hoy" : `en ${v.dias} día${v.dias === 1 ? "" : "s"}`;

/** Lo que pide atención (vencido, hoy, por vencer), de lo más urgente a lo menos. */
export async function leerVencimientos(modulo?: string): Promise<{ lista: Vencimiento[]; error: string | null }> {
  const supabase = await createClient();
  let q = supabase
    .from("v_vencimientos")
    .select("origen_tabla, origen_id, categoria, titulo, detalle, vence, dias, estado, modulo, ruta")
    .in("estado", ["vencido", "hoy", "por_vencer"])
    .order("dias", { ascending: true })
    .limit(500);
  if (modulo) q = q.eq("modulo", modulo);
  const { data, error } = await q;
  return { lista: (data ?? []) as Vencimiento[], error: error?.message ?? null };
}

export function FilaVencimiento({ v }: { v: Vencimiento }) {
  const e = ESTADO_VENC[v.estado];
  return (
    <li>
      <Link href={v.ruta} className={`flex min-h-11 items-start gap-2 rounded-md border bg-white p-2 text-sm ${e.borde}`}>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {v.categoria} · {NOMBRE_MODULO_VENC[v.modulo] ?? v.modulo}
          </p>
          <p className="break-words font-medium text-slate-900">{v.titulo}</p>
          {v.detalle && <p className="break-words text-xs text-slate-600">{v.detalle}</p>}
        </div>
        <div className="shrink-0 text-right">
          <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${e.chip}`}>{cuando(v)}</span>
          <p className="mt-0.5 text-xs text-slate-500">{fecha(v.vence)}</p>
        </div>
      </Link>
    </li>
  );
}

/**
 * Bloque corto para el inicio y para SG-SST: cuántos vencidos, de hoy y por vencer, y los más
 * urgentes. Si no hay nada que atender, lo dice; si la vista no está, no sale.
 */
export async function BloqueVencimientos({ modulo, limite = 6, titulo = "Vencimientos", verTodo = "/vencimientos" }: { modulo?: string; limite?: number; titulo?: string; verTodo?: string }) {
  const { lista, error } = await leerVencimientos(modulo);
  if (error) return null;
  const cuenta = (s: Vencimiento["estado"]) => lista.filter((v) => v.estado === s).length;
  return (
    <section className="space-y-2 rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex-1 text-sm font-bold text-slate-900">{titulo}</h2>
        {(["vencido", "hoy", "por_vencer"] as const).map((s) =>
          cuenta(s) ? (
            <span key={s} className={`rounded-full px-2 py-0.5 text-xs font-semibold ${ESTADO_VENC[s].chip}`}>
              {cuenta(s)} {ESTADO_VENC[s].nombre.toLowerCase()}
            </span>
          ) : null,
        )}
      </div>
      {lista.length === 0 ? (
        <p className="text-sm text-slate-500">Nada vencido ni por vencer.</p>
      ) : (
        <ul className="space-y-1.5">
          {lista.slice(0, limite).map((v) => (
            <FilaVencimiento key={`${v.origen_tabla}-${v.origen_id}`} v={v} />
          ))}
        </ul>
      )}
      {lista.length > limite && (
        <Link href={modulo ? `${verTodo}?modulo=${modulo}` : verTodo} className="inline-flex min-h-11 items-center text-sm font-semibold text-slate-700 underline">
          Ver los {lista.length}
        </Link>
      )}
    </section>
  );
}
