import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatoPesos } from "@/lib/siigo";
import { fechaCorta } from "@/lib/marketing";
import { Corte, SoloLectura } from "@/components/siigo/Corte";

const TIPO: Record<string, string> = { venta: "Factura de venta", compra: "Factura de compra", nota_credito: "Nota crédito", documento_soporte: "Documento soporte" };

interface Item {
  linea: number | null;
  codigo: string | null;
  descripcion: string | null;
  cantidad: number | null;
  valor_unitario: number | null;
  descuento: number | null;
  impuestos: number | null;
  total: number | null;
}

/** Una factura de Siigo con sus ítems. Solo lectura: el documento legal es el de Siigo. */
export default async function FacturaPage(props: PageProps<"/financiero/facturacion/[id]">) {
  const { id } = await props.params;
  const siigoId = decodeURIComponent(id);
  const supabase = await createClient();
  const [fRes, iRes] = await Promise.all([
    supabase
      .from("siigo_facturas")
      .select("*, siigo_terceros(nombre, cliente_id), proyectos(id, codigo, nombre), cotizaciones(id, codigo)")
      .eq("siigo_id", siigoId)
      .maybeSingle(),
    supabase.from("siigo_factura_items").select("linea, codigo, descripcion, cantidad, valor_unitario, descuento, impuestos, total").eq("factura_id", siigoId).order("linea"),
  ]);
  const f = fRes.data as {
    tipo: string;
    prefijo: string | null;
    numero: string | null;
    fecha: string;
    identificacion: string | null;
    subtotal: number | null;
    descuento: number | null;
    impuestos: number | null;
    total: number | null;
    saldo: number | null;
    estado: string | null;
    cufe: string | null;
    sincronizado_en: string;
    siigo_terceros: { nombre: string; cliente_id: string | null } | null;
    proyectos: { id: string; codigo: string; nombre: string } | null;
    cotizaciones: { id: string; codigo: string } | null;
  } | null;
  if (!f) notFound();
  const items = (iRes.data ?? []) as Item[];

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 space-y-3 p-4 sm:p-6">
      <Link href={`/financiero/facturacion?tipo=${f.tipo}`} className="text-sm text-slate-600 underline">
        ← Facturación
      </Link>
      <div>
        <h1 className="text-lg font-bold text-slate-900">
          {TIPO[f.tipo] ?? f.tipo} {[f.prefijo, f.numero].filter(Boolean).join("-")}
        </h1>
        <p className="text-sm text-slate-700">
          {f.siigo_terceros?.cliente_id ? (
            <Link href={`/administrativo/clientes/${f.siigo_terceros.cliente_id}`} className="underline">
              {f.siigo_terceros.nombre}
            </Link>
          ) : (
            (f.siigo_terceros?.nombre ?? "—")
          )}{" "}
          · NIT {f.identificacion ?? "—"} · {fechaCorta(f.fecha)}
          {f.estado && ` · ${f.estado}`}
        </p>
        <p className="text-xs text-slate-600">
          {f.proyectos ? (
            <Link href={`/proyectos/${f.proyectos.id}`} className="underline">
              Proyecto {f.proyectos.codigo} {f.proyectos.nombre}
            </Link>
          ) : (
            "Sin proyecto del ERP"
          )}
          {f.cotizaciones && (
            <>
              {" · "}
              <Link href={`/comercial/cotizaciones/${f.cotizaciones.id}`} className="underline">
                Cotización {f.cotizaciones.codigo}
              </Link>
            </>
          )}
        </p>
      </div>
      <Corte al={f.sincronizado_en} />
      <SoloLectura />
      <section className="rounded-lg border border-slate-300 bg-white p-3">
        {!items.length ? (
          <p className="text-sm text-slate-500">Siigo no trajo los ítems de este documento.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {items.map((i, n) => (
              <li key={i.linea ?? n} className="flex items-start gap-2 py-1.5 text-sm">
                <span className="min-w-0 flex-1">
                  {i.descripcion ?? i.codigo}
                  <span className="block text-xs text-slate-500">
                    {[i.codigo, i.cantidad != null && `${Number(i.cantidad).toLocaleString("es-CO")} × ${formatoPesos(i.valor_unitario)}`, Number(i.descuento ?? 0) > 0 && `desc. ${formatoPesos(i.descuento)}`]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                <span className="tabular-nums">{formatoPesos(i.total)}</span>
              </li>
            ))}
          </ul>
        )}
        <dl className="mt-2 space-y-0.5 border-t border-slate-200 pt-2 text-sm">
          {[
            ["Subtotal", f.subtotal],
            ["Descuento", f.descuento],
            ["Impuestos", f.impuestos],
          ].map(([k, v]) => (
            <div key={k as string} className="flex justify-between text-slate-600">
              <dt>{k}</dt>
              <dd className="tabular-nums">{formatoPesos(v as number | null)}</dd>
            </div>
          ))}
          <div className="flex justify-between font-semibold text-slate-900">
            <dt>Total</dt>
            <dd className="tabular-nums">{formatoPesos(f.total)}</dd>
          </div>
          {Number(f.saldo ?? 0) > 0 && (
            <div className="flex justify-between font-semibold text-amber-800">
              <dt>Saldo pendiente</dt>
              <dd className="tabular-nums">{formatoPesos(f.saldo)}</dd>
            </div>
          )}
        </dl>
        {f.cufe && <p className="mt-2 break-all text-[11px] text-slate-500">CUFE {f.cufe}</p>}
      </section>
    </div>
  );
}
