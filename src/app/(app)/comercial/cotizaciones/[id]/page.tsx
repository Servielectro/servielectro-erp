import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCotizacionDetalle } from "@/lib/supabase/cotizaciones";
import { formatCOP, type Categoria } from "@/lib/pricing";
import { tienePermiso } from "@/lib/permisos";
import { ESTADO_COTIZACION, type AlertaCotizacion, type Paso } from "@/lib/cotizaciones/seguimiento";
import { SeguimientoCotizacion } from "./SeguimientoCotizacion";

const CATEGORIA_LABEL: Record<Categoria, string> = {
  EQUIPO: "Equipos",
  MATERIAL: "Materiales",
  MANO_DE_OBRA: "Mano de obra",
};

export default async function CotizacionDetallePage(
  props: PageProps<"/comercial/cotizaciones/[id]">,
) {
  const { id } = await props.params;
  const supabase = await createClient();
  const cotizacion = await getCotizacionDetalle(supabase, id);

  if (!cotizacion) {
    notFound();
  }

  // Seguimiento (migraciones 98 y 99). Sin ellas corridas, estas consultas fallan y el panel no sale.
  const [segRes, alertaRes, pasosRes, respRes, trabaja] = await Promise.all([
    supabase.from("cotizaciones").select("validez_dias").eq("id", id).maybeSingle(),
    supabase.from("v_cotizaciones_alertas").select("*").eq("cotizacion_id", id).maybeSingle(),
    supabase
      .from("cotizacion_seguimientos")
      .select("id, tipo, detalle_otro, fecha_programada, responsable_id, notas, creado_en, realizado_en, resultado, cerrado_por")
      .eq("cotizacion_id", id)
      .order("creado_en", { ascending: false }),
    supabase.rpc("fn_crm_responsables"),
    tienePermiso("comercial", "trabajar"),
  ]);
  const conSeguimiento = !segRes.error && !pasosRes.error;

  const porCategoria = (cat: Categoria) =>
    cotizacion.items.filter((i) => i.categoria === cat);

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 pb-8">
      <header className="sticky top-0 z-10 space-y-2 border-b border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <Link href="/comercial/cotizaciones" className="text-sm text-slate-600">
            ← Cotizaciones
          </Link>
          <span className={`rounded-full px-2 py-1 text-xs font-medium ${ESTADO_COTIZACION[cotizacion.estado]?.clase ?? "bg-slate-100 text-slate-700"}`}>
            {ESTADO_COTIZACION[cotizacion.estado]?.etiqueta ?? cotizacion.estado}
          </span>
        </div>
        <div>
          <p className="text-sm font-mono text-slate-600">
            {cotizacion.codigo}
          </p>
          <h1 className="text-lg font-semibold text-slate-900">
            {cotizacion.cliente.nombre}
          </h1>
          <p className="text-sm text-slate-600">{cotizacion.descripcion}</p>
        </div>
        <div className="flex gap-2 pt-1">
          <Link
            href={`/comercial/cotizaciones/${cotizacion.id}/imprimir`}
            className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-center text-sm font-medium text-slate-700"
          >
            Imprimir
          </Link>
          <Link
            href={`/comercial/cotizaciones/nueva?duplicar=${cotizacion.id}`}
            className="flex-1 rounded-md bg-slate-900 px-3 py-2 text-center text-sm font-medium text-white"
          >
            Duplicar
          </Link>
        </div>
      </header>

      <main className="flex-1 space-y-4 p-4">
        {conSeguimiento && (
          <SeguimientoCotizacion
            // Al cerrar un paso o cambiar el estado, el formulario arranca de nuevo con lo guardado.
            key={`${cotizacion.estado}:${(pasosRes.data ?? []).length}:${(segRes.data as { validez_dias: number } | null)?.validez_dias}`}
            cotizacionId={cotizacion.id}
            estado={cotizacion.estado}
            validezDias={(segRes.data as { validez_dias: number } | null)?.validez_dias ?? 10}
            alerta={(alertaRes.data as AlertaCotizacion | null) ?? undefined}
            pasos={(pasosRes.data ?? []) as Paso[]}
            responsables={(respRes.data ?? []) as { id: string; nombre: string }[]}
            trabaja={trabaja}
          />
        )}
        {(["EQUIPO", "MATERIAL", "MANO_DE_OBRA"] as Categoria[]).map((cat) => {
          const items = porCategoria(cat);
          if (items.length === 0) return null;
          return (
            <section key={cat}>
              <h2 className="mb-2 text-sm font-semibold text-slate-700">
                {CATEGORIA_LABEL[cat]}
              </h2>
              <div className="space-y-2">
                {items.map((it) => (
                  <div
                    key={it.id}
                    className="rounded-lg border border-slate-200 bg-white p-3"
                  >
                    <div className="flex justify-between gap-2">
                      <p className="text-sm text-slate-900">
                        {it.descripcion}
                      </p>
                      <p className="shrink-0 text-sm font-semibold text-slate-900">
                        {formatCOP(it.valorCalculoUnitario * it.cantidad)}
                      </p>
                    </div>
                    <p className="text-xs text-slate-600">
                      {it.cantidad} {it.unidad} × {formatCOP(it.valorCalculoUnitario)}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          );
        })}

        {cotizacion.totales && (
          <section className="space-y-1 rounded-lg border border-slate-200 bg-white p-4 text-sm">
            <FilaTotal
              label="Subtotal cálculo"
              valor={cotizacion.totales.subtotalCalculo}
            />
            {/* IVA FULL no lleva AIU: ni filas de A, I, U ni un subtotal general repetido. */}
            {cotizacion.esquemaIva === "IVA_AIU" && (
              <>
                <FilaTotal label="Administración" valor={cotizacion.totales.valorAdmin} />
                <FilaTotal
                  label="Imprevistos"
                  valor={cotizacion.totales.valorImprevistos}
                />
                <FilaTotal
                  label="Utilidad (AIU)"
                  valor={cotizacion.totales.valorUtilidadAiu}
                />
                <FilaTotal
                  label="Subtotal general"
                  valor={cotizacion.totales.subtotalGeneral}
                  destacado
                />
              </>
            )}
            <FilaTotal label="IVA" valor={cotizacion.totales.valorIva} />
            <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-bold text-slate-900">
              <span>Total</span>
              <span>{formatCOP(cotizacion.totales.totalCotizacion)}</span>
            </div>
          </section>
        )}

        {cotizacion.hitos.length > 0 && (
          <section>
            <h2 className="mb-2 text-sm font-semibold text-slate-700">
              Esquema de pagos
            </h2>
            <div className="space-y-2">
              {cotizacion.hitos.map((h) => (
                <div
                  key={h.id}
                  className="flex justify-between rounded-lg border border-slate-200 bg-white p-3"
                >
                  <span className="text-sm text-slate-900">
                    {h.nombre} ({(h.porcentaje * 100).toFixed(0)}%)
                  </span>
                  <span className="text-sm font-semibold text-slate-900">
                    {formatCOP(h.valorProgramado)}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {cotizacion.capas && (
          <section className="space-y-1 rounded-lg border border-green-200 bg-green-50 p-4 text-sm">
            <h2 className="mb-1 text-sm font-semibold text-green-800">
              Utilidad real del proyecto
            </h2>
            <FilaTotal label="Gasto admin" valor={cotizacion.capas.gastoAdmin} />
            <FilaTotal label="Gasto renta" valor={cotizacion.capas.gastoRenta} />
            <FilaTotal label="Gasto ICA" valor={cotizacion.capas.gastoIca} />
            <div className="flex justify-between border-t border-green-200 pt-1 font-semibold text-green-800">
              <span>Utilidad total</span>
              <span>
                {formatCOP(cotizacion.capas.utilidadTotal)} (
                {cotizacion.capas.pctUtilidadTotal.toFixed(1)}%)
              </span>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function FilaTotal({
  label,
  valor,
  destacado,
}: {
  label: string;
  valor: number;
  destacado?: boolean;
}) {
  return (
    <div
      className={`flex justify-between ${destacado ? "font-semibold text-slate-900" : "text-slate-600"}`}
    >
      <span>{label}</span>
      <span>{formatCOP(valor)}</span>
    </div>
  );
}
