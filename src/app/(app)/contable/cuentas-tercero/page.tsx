import { createClient } from "@/lib/supabase/server";
import { corteDe, formatoPesos, nombreMes, periodoPedido } from "@/lib/siigo";
import { EncabezadoSiigo, SelectorPeriodo } from "@/components/siigo/Corte";

interface Fila {
  cuenta: string;
  nombre_cuenta: string | null;
  identificacion: string;
  nombre_tercero: string | null;
  saldo_inicial: number | null;
  debitos: number | null;
  creditos: number | null;
  saldo_final: number | null;
}

/** Balance por tercero de Siigo (siigo_balance con identificación): qué saldo tiene cada uno en cada cuenta. */
export default async function CuentasTerceroPage(props: PageProps<"/contable/cuentas-tercero">) {
  const sp = await props.searchParams;
  const tercero = typeof sp.tercero === "string" ? sp.tercero.replace(/[^\w ]/g, "").trim() : "";
  const cuenta = typeof sp.cuenta === "string" ? sp.cuenta.replace(/\D/g, "") : "";
  const supabase = await createClient();
  const [al, ultimoRes] = await Promise.all([
    corteDe(supabase, "siigo_balance"),
    supabase.from("siigo_balance").select("anio, mes").not("identificacion", "is", null).order("anio", { ascending: false }).order("mes", { ascending: false }).limit(1),
  ]);
  const { anio, mes, anios } = periodoPedido(sp, (ultimoRes.data?.[0] as { anio: number; mes: number } | undefined) ?? null);
  let consulta = supabase
    .from("siigo_balance")
    .select("cuenta, nombre_cuenta, identificacion, nombre_tercero, saldo_inicial, debitos, creditos, saldo_final")
    .not("identificacion", "is", null)
    .eq("anio", anio)
    .eq("mes", mes)
    .order("nombre_tercero")
    .order("cuenta")
    .limit(3000);
  if (tercero) consulta = consulta.or(`identificacion.ilike.%${tercero}%,nombre_tercero.ilike.%${tercero}%`);
  if (cuenta) consulta = consulta.like("cuenta", `${cuenta}%`);
  const res = await consulta;
  // Sin total por tercero, a propósito: sumaría cuentas débito con cuentas crédito.
  const grupos = new Map<string, { nombre: string; filas: Fila[] }>();
  for (const f of (res.data ?? []) as Fila[]) {
    const g = grupos.get(f.identificacion) ?? { nombre: f.nombre_tercero ?? f.identificacion, filas: [] };
    g.filas.push(f);
    grupos.set(f.identificacion, g);
  }
  const input = "mt-1 block min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-base font-normal";

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 space-y-3 p-4 sm:p-6 lg:max-w-5xl">
      <EncabezadoSiigo volver="contable" titulo="Cuentas por tercero" al={al}>
        Saldo de cada cuenta por cliente o proveedor, del balance por tercero de Siigo. Para ver la cartera de un cliente, filtrar por la cuenta 1305.
      </EncabezadoSiigo>
      {al && (
        <>
          <SelectorPeriodo
            accion="/contable/cuentas-tercero"
            anio={anio}
            mes={mes}
            anios={anios}
            extra={
              <>
                <label className="text-xs font-semibold text-slate-700">
                  Tercero
                  <input name="tercero" defaultValue={tercero} placeholder="Nombre o NIT" className={`${input} w-44`} />
                </label>
                <label className="text-xs font-semibold text-slate-700">
                  Cuenta empieza por
                  <input name="cuenta" inputMode="numeric" defaultValue={cuenta} placeholder="1305" className={`${input} w-28`} />
                </label>
              </>
            }
          />
          <h2 className="text-sm font-bold text-slate-900">{mes === 13 ? `Cierre contable ${anio} (periodo 13)` : `${nombreMes(mes)} de ${anio}`}</h2>
          {res.error && <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">No se pudo leer: {res.error.message}</p>}
          {!grupos.size ? (
            <p className="py-6 text-center text-sm text-slate-500">No hay saldos por tercero para ese periodo y filtro.</p>
          ) : (
            <ul className="space-y-2">
              {[...grupos.entries()].map(([id, g]) => (
                <li key={id} className="rounded-lg border border-slate-300 bg-white p-3">
                  <details>
                    <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2">
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-slate-900">{g.nombre}</span>
                        <span className="block text-xs text-slate-600">
                          NIT {id} · {g.filas.length} cuenta{g.filas.length === 1 ? "" : "s"}
                        </span>
                      </span>
                      <span className="text-xs text-slate-500">ver</span>
                    </summary>
                    <table className="mt-2 w-full text-sm">
                      <tbody>
                        {g.filas.map((f) => (
                          <tr key={f.cuenta} className="border-t border-slate-100">
                            <td className="py-1.5">
                              <span className="tabular-nums text-slate-500">{f.cuenta}</span> {f.nombre_cuenta}
                            </td>
                            <td className="py-1.5 text-right tabular-nums">{formatoPesos(f.saldo_final)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </details>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
