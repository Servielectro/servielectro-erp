import { createClient } from "@/lib/supabase/server";
import { corteDe, formatoPesos } from "@/lib/siigo";
import { fechaCorta, hoyBogota } from "@/lib/marketing";
import { EncabezadoSiigo } from "@/components/siigo/Corte";

interface Cuenta {
  id: string;
  identificacion: string;
  nombre_tercero: string | null;
  documento: string | null;
  fecha: string | null;
  vence_el: string | null;
  valor: number | null;
  saldo: number | null;
}

const TRAMOS = [
  { key: "vencido", label: "Vencido", clase: "text-red-700" },
  { key: "7", label: "Vence en 7 días", clase: "text-amber-700" },
  { key: "30", label: "8 a 30 días", clase: "text-slate-800" },
  { key: "mas", label: "Más de 30 días", clase: "text-slate-600" },
  { key: "sin", label: "Sin fecha de vencimiento", clase: "text-slate-600" },
] as const;

/** Cuentas por pagar de Siigo (siigo_cuentas_por_pagar con saldo): a quién se le debe y cuándo vence. */
export default async function CuentasPagarPage() {
  const supabase = await createClient();
  const [al, res] = await Promise.all([
    corteDe(supabase, "siigo_cuentas_por_pagar"),
    supabase.from("siigo_cuentas_por_pagar").select("id, identificacion, nombre_tercero, documento, fecha, vence_el, valor, saldo").gt("saldo", 0).order("vence_el", { ascending: true, nullsFirst: false }).limit(2000),
  ]);
  const hoy = hoyBogota();
  const dias = (f: string) => Math.round((new Date(`${f}T12:00:00`).getTime() - new Date(`${hoy}T12:00:00`).getTime()) / 86_400_000);
  const tramo = (c: Cuenta) => (!c.vence_el ? "sin" : dias(c.vence_el) < 0 ? "vencido" : dias(c.vence_el) <= 7 ? "7" : dias(c.vence_el) <= 30 ? "30" : "mas");
  const filas = (res.data ?? []) as Cuenta[];
  const porTramo = TRAMOS.map((t) => ({ ...t, filas: filas.filter((c) => tramo(c) === t.key) }));
  const suma = (xs: Cuenta[]) => xs.reduce((s, c) => s + Number(c.saldo ?? 0), 0);

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 space-y-3 p-4 sm:p-6 lg:max-w-5xl">
      <EncabezadoSiigo volver="financiero" titulo="Cuentas por pagar" al={al}>
        Lo que se le debe a proveedores según Siigo. Un pago hecho después del corte todavía no se ve aquí.
      </EncabezadoSiigo>
      {al && (
        <>
          {res.error && <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">No se pudo leer: {res.error.message}</p>}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {porTramo.slice(0, 4).map((t) => (
              <div key={t.key} className="rounded-lg border border-slate-300 bg-white p-3">
                <p className="text-xs text-slate-600">{t.label}</p>
                <p className={`text-sm font-bold tabular-nums sm:text-base ${t.clase}`}>{formatoPesos(suma(t.filas))}</p>
                <p className="text-[11px] text-slate-500">
                  {t.filas.length} documento{t.filas.length === 1 ? "" : "s"}
                </p>
              </div>
            ))}
          </div>
          <p className="text-sm text-slate-800">
            Total por pagar: <span className="font-bold tabular-nums">{formatoPesos(suma(filas))}</span>
          </p>
          {!filas.length ? (
            <p className="py-6 text-center text-sm text-green-800">✓ No hay cuentas por pagar con saldo.</p>
          ) : (
            porTramo
              .filter((t) => t.filas.length)
              .map((t) => (
                <section key={t.key} className="rounded-lg border border-slate-300 bg-white p-3">
                  <h2 className={`text-sm font-bold ${t.clase}`}>
                    {t.label} · {formatoPesos(suma(t.filas))}
                  </h2>
                  <ul className="mt-1 divide-y divide-slate-100">
                    {t.filas.map((c) => (
                      <li key={c.id} className="flex items-start gap-2 py-1.5 text-sm">
                        <span className="min-w-0 flex-1">
                          {c.nombre_tercero ?? c.identificacion}
                          <span className="block text-xs text-slate-500">
                            {[c.documento, c.fecha && `del ${fechaCorta(c.fecha)}`, c.vence_el && `vence ${fechaCorta(c.vence_el)}`, c.vence_el && dias(c.vence_el) < 0 && `hace ${-dias(c.vence_el)} días`]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        </span>
                        <span className="shrink-0 text-right tabular-nums">
                          {formatoPesos(c.saldo)}
                          {Number(c.valor) !== Number(c.saldo) && <span className="block text-xs text-slate-500">de {formatoPesos(c.valor)}</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              ))
          )}
        </>
      )}
    </div>
  );
}
