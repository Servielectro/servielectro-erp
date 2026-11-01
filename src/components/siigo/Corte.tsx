import Link from "next/link";
import { diasDesde, fechaHora } from "@/lib/siigo";

// Toda pantalla del espejo dice de cuándo es el dato: un saldo sin fecha de corte es un número
// suelto, y aquí se habla de plata que se declara. Con más de un día, se dice en pantalla.

/** `al` = el sincronizado_en más reciente de lo que se muestra; null = no ha llegado nada. */
export function Corte({ al }: { al: string | null }) {
  if (!al)
    return (
      <div className="rounded-lg border border-dashed border-slate-400 bg-slate-50 px-3 py-3 text-sm text-slate-800">
        <p className="font-semibold">Todavía no hay datos: falta conectar Siigo.</p>
        <p className="mt-0.5 text-xs text-slate-600">
          Esta pantalla ya tiene su forma; se llena sola cuando corra la primera sincronización.{" "}
          <Link href="/contable/conexion" className="underline">
            Ver el estado de la conexión
          </Link>
        </p>
      </div>
    );
  const dias = diasDesde(al);
  if (dias >= 1)
    return (
      <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
        <span className="font-semibold">
          Datos de Siigo de hace {dias} día{dias === 1 ? "" : "s"}
        </span>{" "}
        (corte: {fechaHora(al)}). Lo de después todavía no se ve aquí.
      </p>
    );
  return <p className="text-xs text-slate-600">Datos de Siigo al {fechaHora(al)}</p>;
}

/** El recordatorio de que esto no se edita aquí. */
export function SoloLectura() {
  return (
    <p className="text-xs text-slate-600">
      🔒 Solo lectura: es una copia de Siigo. Si algo está mal, se corrige en Siigo y aquí se ve en la siguiente sincronización.
    </p>
  );
}

/** Encabezado común: volver, título, explicación, corte y candado. */
export function EncabezadoSiigo({ volver, titulo, al, children }: { volver: "contable" | "financiero"; titulo: string; al: string | null; children?: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Link href={`/${volver}`} className="text-sm text-slate-600 underline">
        ← {volver === "contable" ? "Contable" : "Financiero"}
      </Link>
      <h1 className="text-lg font-bold text-slate-900">{titulo}</h1>
      {children && <div className="text-xs text-slate-600">{children}</div>}
      <Corte al={al} />
      <SoloLectura />
    </div>
  );
}

/**
 * Selector de año y mes como formulario GET (sin JavaScript). El 13 va aparte: es el cierre
 * contable, no un mes más.
 */
export function SelectorPeriodo({ accion, anio, mes, anios, extra }: { accion: string; anio: number; mes: number; anios: number[]; extra?: React.ReactNode }) {
  const meses = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
  return (
    <form action={accion} className="flex flex-wrap items-end gap-2">
      <label className="text-xs font-semibold text-slate-700">
        Año
        <select name="anio" defaultValue={anio} className="mt-1 block min-h-11 rounded-lg border border-slate-300 bg-white px-2 text-base font-normal">
          {anios.map((a) => (
            <option key={a}>{a}</option>
          ))}
        </select>
      </label>
      <label className="text-xs font-semibold text-slate-700">
        Mes
        <select name="mes" defaultValue={mes} className="mt-1 block min-h-11 rounded-lg border border-slate-300 bg-white px-2 text-base font-normal">
          {meses.map((m, i) => (
            <option key={m} value={i + 1}>
              {m}
            </option>
          ))}
          <optgroup label="Cierre contable">
            <option value={13}>13 · Cierre del año (no es diciembre)</option>
          </optgroup>
        </select>
      </label>
      {extra}
      <button className="min-h-11 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white">Ver</button>
    </form>
  );
}
