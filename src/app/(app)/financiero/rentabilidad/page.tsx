import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { corteDe, formatoPesos } from "@/lib/siigo";
import { Corte, SoloLectura } from "@/components/siigo/Corte";

interface Proyecto {
  id: string;
  codigo: string;
  nombre: string;
  estado: "EN_EJECUCION" | "CERRADO" | "SUSPENDIDO";
  cotizacion_aprobada_id: string;
  clientes: { nombre: string } | null;
}
interface Fila {
  p: Proyecto;
  cotizadoSinIva: number | null;
  costoPresupuestado: number | null;
  utilidadEsperada: number | null;
  facturadoSinIva: number;
  facturas: number;
  saldoPorCobrar: number;
  hitosProgramado: number;
  hitosCobrado: number;
  compras: number;
  gastos: number;
  contratistas: number;
  comprasSiigo: number;
}

const ESTADO: Record<Proyecto["estado"], string> = { EN_EJECUCION: "En ejecución", CERRADO: "Cerrado", SUSPENDIDO: "Suspendido" };
const pctTxt = (v: number) => `${v.toLocaleString("es-CO", { maximumFractionDigits: 1 })}%`;

/**
 * Rentabilidad por proyecto: lo que Siigo facturó (siigo_facturas.proyecto_id) contra lo que
 * costó según el ERP (compras de la obra, gastos del personal y cuentas de cobro de contratistas)
 * y lo que se esperaba ganar según la cotización aprobada. Siigo sabe lo que se facturó; el ERP
 * sabe lo que costó. Juntos dicen si la obra dejó plata.
 */
export default async function RentabilidadPage(props: PageProps<"/financiero/rentabilidad">) {
  const sp = await props.searchParams;
  const verTodos = sp.ver === "todos";
  const supabase = await createClient();
  let consultaProy = supabase.from("proyectos").select("id, codigo, nombre, estado, cotizacion_aprobada_id, clientes(nombre)").order("codigo", { ascending: false }).limit(200);
  if (!verTodos) consultaProy = consultaProy.neq("estado", "SUSPENDIDO");
  const [al, proyRes] = await Promise.all([corteDe(supabase, "siigo_facturas"), consultaProy]);
  const proyectos = (proyRes.data ?? []) as unknown as Proyecto[];
  const ids = proyectos.map((p) => p.id);
  const cots = proyectos.map((p) => p.cotizacion_aprobada_id);

  const [totRes, capRes, factRes, hitRes, ejeRes, gasRes, conRes] = ids.length
    ? await Promise.all([
        supabase.from("v_cotizacion_totales_iva").select("cotizacion_id, subtotal_general, subtotal_compra").in("cotizacion_id", cots),
        supabase.from("v_capas_utilidad").select("cotizacion_id, utilidad_total").in("cotizacion_id", cots),
        supabase.from("siigo_facturas").select("proyecto_id, tipo, subtotal, saldo").in("proyecto_id", ids),
        supabase.from("hitos_cobro").select("proyecto_id, valor_programado, valor_cobrado").in("proyecto_id", ids),
        supabase.from("proyecto_ejecucion_items").select("proyecto_id, cantidad, valor_compra_real_unitario").in("proyecto_id", ids),
        supabase.from("gastos").select("proyecto_id, monto").in("proyecto_id", ids).neq("estado", "anulado"),
        supabase.from("contratista_cuentas_cobro").select("proyecto_id, valor_total").in("proyecto_id", ids).in("estado", ["aprobada", "pagada"]),
      ])
    : [];

  const n = (v: unknown) => Number(v ?? 0);
  const por = <T extends { proyecto_id: string | null }>(xs: T[] | null | undefined, id: string) => (xs ?? []).filter((x) => x.proyecto_id === id);
  const filas: Fila[] = proyectos.map((p) => {
    const tot = (totRes?.data ?? []).find((t) => t.cotizacion_id === p.cotizacion_aprobada_id) as { subtotal_general: number; subtotal_compra: number } | undefined;
    const cap = (capRes?.data ?? []).find((t) => t.cotizacion_id === p.cotizacion_aprobada_id) as { utilidad_total: number | null } | undefined;
    const facts = por(factRes?.data as { proyecto_id: string; tipo: string; subtotal: number | null; saldo: number | null }[], p.id);
    const ventas = facts.filter((f) => f.tipo === "venta");
    const notas = facts.filter((f) => f.tipo === "nota_credito");
    return {
      p,
      cotizadoSinIva: tot ? n(tot.subtotal_general) : null,
      costoPresupuestado: tot ? n(tot.subtotal_compra) : null,
      utilidadEsperada: cap?.utilidad_total != null ? n(cap.utilidad_total) : null,
      facturadoSinIva: ventas.reduce((s, f) => s + n(f.subtotal), 0) - notas.reduce((s, f) => s + Math.abs(n(f.subtotal)), 0),
      facturas: ventas.length,
      saldoPorCobrar: ventas.reduce((s, f) => s + n(f.saldo), 0),
      hitosProgramado: por(hitRes?.data as { proyecto_id: string; valor_programado: number }[], p.id).reduce((s, h) => s + n(h.valor_programado), 0),
      hitosCobrado: por(hitRes?.data as { proyecto_id: string; valor_cobrado: number | null }[], p.id).reduce((s, h) => s + n(h.valor_cobrado), 0),
      compras: por(ejeRes?.data as { proyecto_id: string; cantidad: number; valor_compra_real_unitario: number }[], p.id).reduce((s, e) => s + n(e.cantidad) * n(e.valor_compra_real_unitario), 0),
      gastos: por(gasRes?.data as { proyecto_id: string; monto: number }[], p.id).reduce((s, g) => s + n(g.monto), 0),
      contratistas: por(conRes?.data as { proyecto_id: string; valor_total: number }[], p.id).reduce((s, c) => s + n(c.valor_total), 0),
      comprasSiigo: facts.filter((f) => f.tipo === "compra" || f.tipo === "documento_soporte").reduce((s, f) => s + n(f.subtotal), 0),
    };
  });

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 space-y-3 p-4 sm:p-6 lg:max-w-6xl">
      <Link href="/financiero" className="text-sm text-slate-600 underline">
        ← Financiero
      </Link>
      <h1 className="text-lg font-bold text-slate-900">Rentabilidad por proyecto</h1>
      <p className="text-xs text-slate-600">
        Siigo sabe lo que se facturó; el ERP sabe lo que costó. Margen real = facturado sin IVA (menos notas crédito) − costo real registrado en el ERP. Se compara con la utilidad que prometía la cotización aprobada.
      </p>
      <Corte al={al} />
      <SoloLectura />
      <details className="rounded-lg border border-slate-300 bg-white p-3 text-xs text-slate-700">
        <summary className="min-h-9 cursor-pointer font-semibold text-slate-900">Qué entra en el costo y qué no</summary>
        <ul className="mt-1 list-disc space-y-0.5 pl-5">
          <li>Entra: compras de la obra (ejecución real), gastos del personal cargados al proyecto (no anulados) y cuentas de cobro de contratistas aprobadas o pagadas.</li>
          <li>No entra todavía: la nómina del personal propio, la caja menor y las comisiones de referidos. Mientras no entren, el margen se ve mejor de lo que es.</li>
          <li>Los gastos van por lo pagado, con el IVA que traiga la factura; la venta va sin IVA.</li>
          <li>Cada quien ve los costos que sus permisos le dejan ver: con menos permisos, el costo sale incompleto.</li>
          <li>Una factura solo cuenta si en Siigo quedó pegada al proyecto. Las «Compras en Siigo» se muestran aparte para comparar y no se suman, porque pueden ser las mismas que ya están en el ERP.</li>
        </ul>
      </details>
      <Link href={verTodos ? "/financiero/rentabilidad" : "/financiero/rentabilidad?ver=todos"} className="block text-sm text-slate-600 underline">
        {verTodos ? "Ocultar suspendidos" : "Ver también suspendidos"}
      </Link>
      {proyRes.error && <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">No se pudieron leer los proyectos: {proyRes.error.message}</p>}
      {!filas.length ? (
        <p className="py-6 text-center text-sm text-slate-500">No hay proyectos para mostrar.</p>
      ) : (
        <ul className="space-y-2 lg:grid lg:grid-cols-2 lg:gap-2 lg:space-y-0">
          {filas.map((f) => (
            <Tarjeta key={f.p.id} f={f} conSiigo={!!al} />
          ))}
        </ul>
      )}
    </div>
  );
}

function Tarjeta({ f, conSiigo }: { f: Fila; conSiigo: boolean }) {
  const costo = f.compras + f.gastos + f.contratistas;
  const hayFacturas = f.facturas > 0;
  const margen = f.facturadoSinIva - costo;
  const pctMargen = f.facturadoSinIva > 0 ? (margen / f.facturadoSinIva) * 100 : null;
  const pctEsperado = f.utilidadEsperada != null && f.cotizadoSinIva ? (f.utilidadEsperada / f.cotizadoSinIva) * 100 : null;
  const avanceFact = f.cotizadoSinIva ? (f.facturadoSinIva / f.cotizadoSinIva) * 100 : null;
  return (
    <li className="rounded-lg border border-slate-300 bg-white p-3">
      <Link href={`/proyectos/${f.p.id}`} className="text-sm font-semibold text-slate-900 hover:underline">
        {f.p.codigo} · {f.p.nombre}
      </Link>
      <p className="text-xs text-slate-600">
        {[f.p.clientes?.nombre, ESTADO[f.p.estado]].filter(Boolean).join(" · ")}
      </p>
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
        <Dato k="Cotizado (sin IVA)" v={formatoPesos(f.cotizadoSinIva)} />
        <Dato
          k="Facturado en Siigo"
          v={!conSiigo ? "falta conectar" : hayFacturas ? formatoPesos(f.facturadoSinIva) : "sin facturas pegadas"}
          nota={hayFacturas && avanceFact != null ? `${pctTxt(avanceFact)} de lo cotizado` : undefined}
          tenue={!conSiigo || !hayFacturas}
        />
        <Dato k="Cobrado (hitos del ERP)" v={formatoPesos(f.hitosCobrado)} nota={f.hitosProgramado ? `de ${formatoPesos(f.hitosProgramado)} programado` : undefined} />
        <Dato k="Por cobrar en Siigo" v={hayFacturas ? formatoPesos(f.saldoPorCobrar) : "—"} tenue={!hayFacturas} />
        <Dato k="Costo real (ERP)" v={formatoPesos(costo)} nota={f.costoPresupuestado ? `presupuestado ${formatoPesos(f.costoPresupuestado)}` : undefined} />
        <Dato k="Compras en Siigo" v={hayFacturas || f.comprasSiigo ? formatoPesos(f.comprasSiigo) : "—"} nota="para comparar, no se suma" tenue />
      </dl>
      {costo > 0 && (
        <p className="mt-1 text-[11px] text-slate-500">
          Compras {formatoPesos(f.compras)} · gastos {formatoPesos(f.gastos)} · contratistas {formatoPesos(f.contratistas)}
        </p>
      )}
      <div className="mt-2 rounded-md bg-slate-50 px-3 py-2 text-sm">
        {hayFacturas ? (
          <p className={margen < 0 ? "font-semibold text-red-700" : "font-semibold text-slate-900"}>
            Margen real: {formatoPesos(margen)}
            {pctMargen != null && ` (${pctTxt(pctMargen)})`}
          </p>
        ) : (
          <p className="text-slate-600">Margen real: se calcula cuando haya facturas de Siigo pegadas a este proyecto.</p>
        )}
        {f.utilidadEsperada != null && (
          <p className="text-xs text-slate-600">
            La cotización prometía {formatoPesos(f.utilidadEsperada)}
            {pctEsperado != null && ` (${pctTxt(pctEsperado)})`}
            {hayFacturas && avanceFact != null && avanceFact < 95 && " · todavía no se ha facturado todo: comparar al cierre"}
          </p>
        )}
      </div>
    </li>
  );
}

function Dato({ k, v, nota, tenue }: { k: string; v: string; nota?: string; tenue?: boolean }) {
  return (
    <div>
      <dt className="text-[11px] text-slate-500">{k}</dt>
      <dd className={`tabular-nums ${tenue ? "text-slate-500" : "font-semibold text-slate-900"}`}>{v}</dd>
      {nota && <dd className="text-[11px] text-slate-500">{nota}</dd>}
    </div>
  );
}
