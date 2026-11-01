import { createClient } from "@/lib/supabase/server";
import { corteDe, fechaHora, formatoPesos, nivelCuenta, nombreMes, periodoPedido } from "@/lib/siigo";
import { EncabezadoSiigo, SelectorPeriodo } from "@/components/siigo/Corte";

interface Fila {
  cuenta: string;
  nombre_cuenta: string | null;
  saldo_inicial: number | null;
  debitos: number | null;
  creditos: number | null;
  saldo_final: number | null;
  sincronizado_en: string;
}

const NIVELES = [
  { key: "1", label: "Clases" },
  { key: "2", label: "Grupos" },
  { key: "3", label: "Cuentas" },
  { key: "4", label: "Subcuentas" },
  { key: "9", label: "Todo" },
];
const SANGRIA = ["", "pl-3", "pl-6", "pl-9", "pl-12"];

/** Balance de prueba general de Siigo (siigo_balance sin tercero). Mes 1 a 13; el 13 es el cierre. */
export default async function BalancesPage(props: PageProps<"/contable/balances">) {
  const sp = await props.searchParams;
  const supabase = await createClient();
  const [al, ultimoRes] = await Promise.all([
    corteDe(supabase, "siigo_balance"),
    supabase.from("siigo_balance").select("anio, mes").is("identificacion", null).order("anio", { ascending: false }).order("mes", { ascending: false }).limit(1),
  ]);
  const { anio, mes, anios } = periodoPedido(sp, (ultimoRes.data?.[0] as { anio: number; mes: number } | undefined) ?? null);
  const nivel = NIVELES.find((n) => n.key === sp.nivel)?.key ?? "3";
  const res = await supabase
    .from("siigo_balance")
    .select("cuenta, nombre_cuenta, saldo_inicial, debitos, creditos, saldo_final, sincronizado_en")
    .is("identificacion", null)
    .eq("anio", anio)
    .eq("mes", mes)
    .order("cuenta")
    .limit(5000);
  const todas = (res.data ?? []) as Fila[];
  const filas = todas.filter((f) => nivelCuenta(f.cuenta) <= Number(nivel) - 1 || nivel === "9");
  const cortePeriodo = todas.reduce<string | null>((m, f) => (!m || f.sincronizado_en > m ? f.sincronizado_en : m), null);

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 space-y-3 p-4 sm:p-6 lg:max-w-6xl">
      <EncabezadoSiigo volver="contable" titulo="Balances" al={al}>
        Balance de prueba general, tal como sale de Siigo. El periodo 13 es el cierre contable del año: tiene los ajustes de cierre y no es diciembre.
      </EncabezadoSiigo>
      {al && (
        <>
          <SelectorPeriodo
            accion="/contable/balances"
            anio={anio}
            mes={mes}
            anios={anios}
            extra={
              <label className="text-xs font-semibold text-slate-700">
                Detalle
                <select name="nivel" defaultValue={nivel} className="mt-1 block min-h-11 rounded-lg border border-slate-300 bg-white px-2 text-base font-normal">
                  {NIVELES.map((n) => (
                    <option key={n.key} value={n.key}>
                      {n.label}
                    </option>
                  ))}
                </select>
              </label>
            }
          />
          <h2 className="text-sm font-bold text-slate-900">
            {mes === 13 ? `Cierre contable ${anio} (periodo 13)` : `${nombreMes(mes)} de ${anio}`}
            {cortePeriodo && <span className="font-normal text-slate-600"> · cargado de Siigo el {fechaHora(cortePeriodo)}</span>}
          </h2>
          {res.error && <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">No se pudo leer: {res.error.message}</p>}
          {!filas.length ? (
            <p className="py-6 text-center text-sm text-slate-500">No llegó balance de ese periodo.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-300 bg-white">
              <table className="w-full min-w-[40rem] text-sm">
                <thead className="bg-slate-50 text-left text-xs text-slate-600">
                  <tr>
                    <th className="px-2 py-2 font-semibold">Cuenta</th>
                    <th className="px-2 py-2 text-right font-semibold">Saldo inicial</th>
                    <th className="px-2 py-2 text-right font-semibold">Débitos</th>
                    <th className="px-2 py-2 text-right font-semibold">Créditos</th>
                    <th className="px-2 py-2 text-right font-semibold">Saldo final</th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map((f) => {
                    const n = nivelCuenta(f.cuenta);
                    return (
                      <tr key={f.cuenta} className={`border-t border-slate-100 ${n <= 1 ? "font-semibold" : ""}`}>
                        <td className={`px-2 py-1.5 ${SANGRIA[n]}`}>
                          <span className="tabular-nums text-slate-500">{f.cuenta}</span> {f.nombre_cuenta}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{formatoPesos(f.saldo_inicial)}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{formatoPesos(f.debitos)}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{formatoPesos(f.creditos)}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{formatoPesos(f.saldo_final)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
