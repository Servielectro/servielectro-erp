import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { tienePermiso } from "@/lib/permisos";
import { formatCOP } from "@/lib/pricing";
import { ESTADO_COMISION, type Plan } from "@/lib/referidos";
import { Comisiones, NuevaComision, type Comision, type OpcionReferido } from "./Comisiones";

const ESTADOS = ["pendientes", "causada", "aprobada", "pagada", "anulada", "todas"] as const;

/**
 * Liquidación de comisiones (migración 127). Se registra cuando el cliente PAGA (causa = recaudo):
 * causada → aprobada → pagada, o anulada con motivo.
 */
export default async function ComisionesPage(props: PageProps<"/administrativo/comisiones">) {
  const sp = await props.searchParams;
  const ver = (ESTADOS.find((e) => e === sp.ver) ?? "pendientes") as (typeof ESTADOS)[number];
  const referido = typeof sp.referido === "string" ? sp.referido : null;
  const supabase = await createClient();
  let consulta = supabase
    .from("referido_comisiones")
    .select("*, referidos(nombre), proyectos(codigo, nombre), cotizaciones(codigo), referido_registros(nombre_prospecto)")
    .order("causada_en", { ascending: false })
    .limit(500);
  if (referido) consulta = consulta.eq("referido_id", referido);
  const [escribe, comRes, refRes, regRes, proyRes, cotRes] = await Promise.all([
    tienePermiso("administrativo", "trabajar"),
    consulta,
    supabase.from("referidos").select("id, nombre, estado, referido_planes(*)").order("nombre"),
    supabase.from("referido_registros").select("id, referido_id, nombre_prospecto, estado").in("estado", ["vigente", "ganado"]),
    supabase.from("proyectos").select("id, codigo, nombre").order("codigo", { ascending: false }).limit(500),
    supabase.from("cotizaciones").select("id, codigo").order("codigo", { ascending: false }).limit(500),
  ]);
  const todas = (comRes.data ?? []) as Comision[];
  const filas = todas.filter((c) => (ver === "todas" ? true : ver === "pendientes" ? c.estado === "causada" || c.estado === "aprobada" : c.estado === ver));
  const total = (e: string) => todas.filter((c) => c.estado === e).reduce((t, c) => t + Number(c.valor), 0);
  const referidos: OpcionReferido[] = ((refRes.data ?? []) as unknown as { id: string; nombre: string; estado: string; referido_planes: Plan | null }[]).map((r) => ({
    id: r.id,
    nombre: r.nombre,
    estado: r.estado,
    plan: r.referido_planes,
    registros: ((regRes.data ?? []) as { id: string; referido_id: string; nombre_prospecto: string }[]).filter((g) => g.referido_id === r.id),
  }));
  const nombreReferido = referido ? referidos.find((r) => r.id === referido)?.nombre : null;
  const enlace = (v: string) => `/administrativo/comisiones?ver=${v}${referido ? `&referido=${referido}` : ""}`;

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 space-y-3 p-4 sm:p-6 lg:max-w-5xl">
      <Link href="/administrativo/referidos" className="text-sm text-slate-600 underline">
        ← Referenciados
      </Link>
      <h1 className="text-lg font-bold text-slate-900">Comisiones{nombreReferido ? ` de ${nombreReferido}` : ""}</h1>
      {referido && (
        <Link href="/administrativo/comisiones" className="text-sm underline">
          Ver las de todos los referidos
        </Link>
      )}
      <p className="text-xs text-slate-600">
        Una comisión se registra cuando el cliente paga, sobre lo que pagó. Si el cliente no paga, no hay comisión. Después se aprueba y se marca pagada con la fecha del giro.
      </p>
      <div className="grid grid-cols-3 gap-2">
        {(["causada", "aprobada", "pagada"] as const).map((e) => (
          <div key={e} className="rounded-lg border border-slate-300 bg-white p-3">
            <p className="text-xs text-slate-600">{ESTADO_COMISION[e].label}</p>
            <p className="text-sm font-bold text-slate-900 sm:text-base">{formatCOP(total(e))}</p>
            <p className="hidden text-[11px] text-slate-500 sm:block">{ESTADO_COMISION[e].ayuda}</p>
          </div>
        ))}
      </div>
      {escribe && (
        <NuevaComision
          referidos={referidos.filter((r) => r.estado === "activo" || r.id === referido)}
          inicial={referido}
          proyectos={(proyRes.data ?? []) as { id: string; codigo: string; nombre: string }[]}
          cotizaciones={(cotRes.data ?? []) as { id: string; codigo: string }[]}
          yaCausadas={todas.filter((c) => c.estado !== "anulada").map((c) => ({ referido_id: c.referido_id, proyecto_id: c.proyecto_id, valor: Number(c.valor) }))}
        />
      )}
      <nav className="flex flex-wrap gap-1.5">
        {ESTADOS.map((e) => (
          <Link key={e} href={enlace(e)} className={`flex min-h-9 items-center rounded-full border px-3 text-sm ${e === ver ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white"}`}>
            {e === "pendientes" ? "Por pagar" : e === "todas" ? "Todas" : ESTADO_COMISION[e].label}
          </Link>
        ))}
      </nav>
      {comRes.error ? (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">No se pudieron leer las comisiones: {comRes.error.message}</p>
      ) : (
        <Comisiones comisiones={filas} escribe={escribe} />
      )}
    </div>
  );
}
