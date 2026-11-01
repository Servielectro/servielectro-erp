import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { tienePermiso } from "@/lib/permisos";
import { corteDe, fechaHora, formatoPesos, PERIODO_IVA } from "@/lib/siigo";
import { EncabezadoSiigo } from "@/components/siigo/Corte";

interface FilaIva {
  anio: number;
  periodo: string;
  iva_generado: number | null;
  iva_descontable: number | null;
  al_corte: string | null;
}

/**
 * IVA por periodo (v_siigo_iva). Las subcuentas NO van quemadas: salen de siigo_config. Mientras
 * no estén configuradas, la vista devuelve nulos y esta pantalla lo dice en vez de mostrar cero:
 * un IVA en cero con cara de correcto es peor que no mostrar nada.
 */
export default async function IvaPage() {
  const supabase = await createClient();
  const [al, cfgRes, ivaRes, responsable] = await Promise.all([
    corteDe(supabase, "siigo_balance"),
    supabase.from("siigo_config").select("cuentas_iva_generado, cuentas_iva_descontable, periodicidad_iva, cuentas_confirmadas_en").eq("id", 1).maybeSingle(),
    supabase.from("v_siigo_iva").select("*").order("anio", { ascending: false }).order("periodo", { ascending: false }),
    tienePermiso("contable", "responsable"),
  ]);
  const cfg = cfgRes.data as { cuentas_iva_generado: string[]; cuentas_iva_descontable: string[]; periodicidad_iva: string; cuentas_confirmadas_en: string | null } | null;
  const faltaGenerado = !cfg?.cuentas_iva_generado?.length;
  const faltaDescontable = !cfg?.cuentas_iva_descontable?.length;
  const configurado = !faltaGenerado && !faltaDescontable;
  const filas = (ivaRes.data ?? []) as FilaIva[];
  const periodo = PERIODO_IVA[cfg?.periodicidad_iva ?? "cuatrimestral"] ?? "periodo";

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 space-y-3 p-4 sm:p-6">
      <EncabezadoSiigo volver="contable" titulo="IVA" al={al}>
        El IVA generado en ventas menos el descontable de compras es lo que se le debe a la DIAN en cada {periodo}. Sale del balance de Siigo, de las subcuentas que confirme la contadora.
      </EncabezadoSiigo>

      {!configurado ? (
        <section className="rounded-lg border-2 border-red-300 bg-red-50 p-4 text-sm text-red-950">
          <p className="text-base font-bold">Falta configurar las cuentas de IVA con la contadora.</p>
          <p className="mt-1">
            Hasta entonces esta pantalla no muestra ninguna cifra, a propósito: el PUC no fija qué subcuenta de la 2408 es el IVA generado y cuál el descontable, y cada empresa las usa distinto. Un número adivinado tendría cara de correcto.
          </p>
          <ul className="mt-2 list-disc pl-5">
            {faltaGenerado && <li>Falta: subcuenta(s) del IVA generado (ventas).</li>}
            {faltaDescontable && <li>Falta: subcuenta(s) del IVA descontable (compras).</li>}
          </ul>
          <p className="mt-2">
            {responsable ? (
              <Link href="/contable/conexion#cuentas-iva" className="font-semibold underline">
                Configurarlas en Conexión con Siigo →
              </Link>
            ) : (
              "Las configura quien es responsable de Contable, en Conexión con Siigo."
            )}
          </p>
        </section>
      ) : (
        <>
          {!cfg?.cuentas_confirmadas_en ? (
            <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <span className="font-semibold">Cuentas sin confirmar por la contadora.</span> Las cifras salen de {cfg?.cuentas_iva_generado.join(", ")} (generado) y {cfg?.cuentas_iva_descontable.join(", ")} (descontable); no tomarlas como definitivas hasta que ella lo confirme.
            </p>
          ) : (
            <p className="text-xs text-slate-600">
              Generado: {cfg.cuentas_iva_generado.join(", ")} · Descontable: {cfg.cuentas_iva_descontable.join(", ")} · confirmadas el {fechaHora(cfg.cuentas_confirmadas_en)}
            </p>
          )}
          {ivaRes.error && <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">No se pudo leer: {ivaRes.error.message}</p>}
          {al && !filas.length && <p className="py-6 text-center text-sm text-slate-500">El balance que llegó no tiene meses del 1 al 12.</p>}
          {filas.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-slate-300 bg-white">
              <table className="w-full min-w-[34rem] text-sm">
                <thead className="bg-slate-50 text-left text-xs text-slate-600">
                  <tr>
                    <th className="px-2 py-2 font-semibold">Periodo</th>
                    <th className="px-2 py-2 text-right font-semibold">Generado</th>
                    <th className="px-2 py-2 text-right font-semibold">Descontable</th>
                    <th className="px-2 py-2 text-right font-semibold">A cargo</th>
                    <th className="px-2 py-2 text-right font-semibold">Corte</th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map((f) => {
                    // null = ninguna fila del balance coincidió con las cuentas: no es cero.
                    const completo = f.iva_generado != null && f.iva_descontable != null;
                    return (
                      <tr key={`${f.anio}-${f.periodo}`} className="border-t border-slate-100">
                        <td className="px-2 py-1.5 font-semibold">
                          {f.anio} {f.periodo}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{f.iva_generado == null ? <SinDato /> : formatoPesos(f.iva_generado)}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{f.iva_descontable == null ? <SinDato /> : formatoPesos(f.iva_descontable)}</td>
                        <td className="px-2 py-1.5 text-right font-semibold tabular-nums">{completo ? formatoPesos(Number(f.iva_generado) - Number(f.iva_descontable)) : <SinDato />}</td>
                        <td className="px-2 py-1.5 text-right text-xs text-slate-500">{f.al_corte ? fechaHora(f.al_corte) : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-slate-500">
            «Sin movimiento» quiere decir que el balance de ese periodo no trae ninguna de las cuentas configuradas, no que el IVA sea cero. El periodo 13 (cierre) no entra. Las fechas de cada {periodo} hay que confirmarlas contra el calendario tributario de la DIAN.
          </p>
        </>
      )}
    </div>
  );
}

function SinDato() {
  return <span className="text-xs font-normal text-amber-800">sin movimiento</span>;
}
