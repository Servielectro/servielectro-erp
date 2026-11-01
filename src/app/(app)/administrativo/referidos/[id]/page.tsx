import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { tienePermiso } from "@/lib/permisos";
import { formatCOP } from "@/lib/pricing";
import { fechaCorta } from "@/lib/marketing";
import { ESTADO_COMISION, ETIQUETA_BASE, ETIQUETA_CATEGORIA, pct, type Plan } from "@/lib/referidos";
import type { Referido } from "../FormReferido";
import { EditarReferido } from "./EditarReferido";
import { ListaRegistros, NuevoRegistro, type ClienteCorto, type RegistroVista } from "../registros/Registros";

interface ComisionCorta {
  id: string;
  concepto: string;
  valor: number;
  estado: string;
  causada_en: string;
  pagada_en: string | null;
}

/** Ficha del referido (migración 127): sus datos, su plan, sus prospectos y lo que se le debe. */
export default async function FichaReferidoPage(props: PageProps<"/administrativo/referidos/[id]">) {
  const { id } = await props.params;
  const supabase = await createClient();
  const [escribe, refRes, planesRes, regRes, comRes, cliRes] = await Promise.all([
    tienePermiso("administrativo", "trabajar"),
    supabase.from("referidos").select("*").eq("id", id).maybeSingle(),
    supabase.from("referido_planes").select("*").order("nombre"),
    supabase.from("v_referido_registros").select("*").eq("referido_id", id).order("registrado_en", { ascending: false }),
    supabase.from("referido_comisiones").select("id, concepto, valor, estado, causada_en, pagada_en").eq("referido_id", id).order("causada_en", { ascending: false }),
    supabase.from("clientes").select("id, nombre, nit").order("nombre").limit(3000),
  ]);
  const r = refRes.data as (Referido & { acuerdo_path: string | null; creado_en: string }) | null;
  if (!r) notFound();
  const planes = (planesRes.data ?? []) as Plan[];
  const plan = planes.find((p) => p.id === r.plan_id) ?? null;
  const comisiones = (comRes.data ?? []) as ComisionCorta[];
  const total = (estados: string[]) => comisiones.filter((c) => estados.includes(c.estado)).reduce((t, c) => t + Number(c.valor), 0);

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 space-y-3 p-4 sm:p-6">
      <Link href="/administrativo/referidos" className="text-sm text-slate-600 underline">
        ← Referenciados
      </Link>
      <div>
        <h1 className="text-lg font-bold text-slate-900">{r.nombre}</h1>
        <p className="text-xs text-slate-600">
          {[ETIQUETA_CATEGORIA[r.categoria], `${r.tipo_documento} ${r.numero_documento}`, r.ciudad, r.telefono, r.correo].filter(Boolean).join(" · ")}
        </p>
        <p className="mt-1 flex flex-wrap gap-1.5 text-xs">
          <span className={`rounded-full px-2 py-0.5 font-semibold ${r.estado === "activo" ? "bg-green-100 text-green-900" : "bg-slate-200 text-slate-600"}`}>{r.estado}</span>
          <span className={`rounded-full px-2 py-0.5 font-semibold ${r.acuerdo_firmado ? "bg-green-100 text-green-900" : "bg-red-100 text-red-900"}`}>
            {r.acuerdo_firmado ? "Acuerdo firmado" : "Sin acuerdo firmado"}
          </span>
        </p>
        {r.notas && <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{r.notas}</p>}
      </div>
      {escribe && <EditarReferido r={r} planes={planes.filter((p) => p.activo || p.id === r.plan_id)} />}

      <section className="rounded-lg border border-slate-300 bg-white p-3">
        <h2 className="text-sm font-bold text-slate-900">Plan de comisión</h2>
        {plan ? (
          <div className="mt-1 space-y-1 text-sm text-slate-800">
            <p className="font-semibold">{plan.nombre}{!plan.activo && " (plan inactivo)"}</p>
            <ul className="list-disc pl-5 text-sm">
              <li>
                {pct(plan.porcentaje)} {ETIQUETA_BASE[plan.base]}
                {plan.tope_por_proyecto ? `, con tope de ${formatCOP(Number(plan.tope_por_proyecto))} por proyecto` : ""}.
              </li>
              {plan.porcentaje_recurrente && (
                <li>
                  {pct(plan.porcentaje_recurrente)} del canon recurrente (monitoreo o mantenimiento) durante {plan.meses_recurrencia ?? "?"} meses.
                </li>
              )}
              <li>Se causa con el {plan.causa === "recaudo" ? "recaudo: si el cliente no paga, no hay comisión" : "la firma"}.</li>
              <li>Cada prospecto registrado queda protegido {plan.dias_vigencia_registro} días.</li>
            </ul>
            {plan.descripcion && <p className="text-xs text-slate-600">{plan.descripcion}</p>}
          </div>
        ) : (
          <p className="mt-1 text-sm text-amber-800">Sin plan asignado. Sin plan, el cotizador no puede cargar la comisión y los registros duran 90 días.</p>
        )}
      </section>

      <section className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="flex-1 text-sm font-bold text-slate-900">Prospectos registrados</h2>
        </div>
        {escribe && r.estado === "activo" && <NuevoRegistro referidoId={r.id} diasVigencia={plan?.dias_vigencia_registro ?? 90} clientes={(cliRes.data ?? []) as ClienteCorto[]} />}
        {escribe && r.estado !== "activo" && <p className="text-xs text-slate-600">Un referido {r.estado} no puede registrar prospectos nuevos.</p>}
        <ListaRegistros registros={(regRes.data ?? []) as RegistroVista[]} escribe={escribe} />
      </section>

      <section className="rounded-lg border border-slate-300 bg-white p-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="flex-1 text-sm font-bold text-slate-900">Comisiones</h2>
          <Link href={`/administrativo/comisiones?referido=${r.id}`} className="text-sm underline">
            Liquidar
          </Link>
        </div>
        <p className="text-xs text-slate-700">
          Pendiente {formatCOP(total(["causada", "aprobada"]))} · Pagado {formatCOP(total(["pagada"]))}
        </p>
        {comisiones.length === 0 ? (
          <p className="py-2 text-sm text-slate-500">Todavía no se le ha causado ninguna comisión.</p>
        ) : (
          <ul className="mt-1 divide-y divide-slate-100">
            {comisiones.map((c) => (
              <li key={c.id} className="flex items-start gap-2 py-1.5 text-sm">
                <span className="min-w-0 flex-1">
                  {c.concepto}
                  <span className="block text-xs text-slate-500">
                    {fechaCorta(c.causada_en)}
                    {c.pagada_en && ` · pagada ${fechaCorta(c.pagada_en)}`}
                  </span>
                </span>
                <span className="text-right">
                  {formatCOP(Number(c.valor))}
                  <span className={`ml-1 rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${ESTADO_COMISION[c.estado]?.clase}`}>{ESTADO_COMISION[c.estado]?.label}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
