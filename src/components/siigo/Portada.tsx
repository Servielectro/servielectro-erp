import Link from "next/link";
import { fechaHora } from "@/lib/siigo";

export interface Tarjeta {
  href: string;
  icono: string;
  nombre: string;
  texto: string;
}

/** Portada de Contable y Financiero: el estado de la conexión arriba y las secciones. */
export function PortadaSiigo({
  titulo,
  texto,
  conectado,
  ultima,
  tarjetas,
}: {
  titulo: string;
  texto: string;
  conectado: boolean;
  ultima: { estado: string; terminada_en: string | null; iniciada_en: string } | null;
  tarjetas: Tarjeta[];
}) {
  return (
    <div className="mx-auto w-full max-w-3xl flex-1 p-4 sm:p-6 lg:max-w-6xl">
      <h1 className="mb-1 text-center text-sm font-bold text-slate-900">{titulo}</h1>
      <p className="mb-3 text-center text-xs text-slate-600">{texto}</p>
      <Link
        href="/contable/conexion"
        className={`mb-4 block rounded-lg border px-3 py-2 text-sm ${conectado ? "border-green-300 bg-green-50 text-green-900" : "border-dashed border-slate-400 bg-slate-50 text-slate-800"}`}
      >
        {conectado ? (
          <>
            <span className="font-semibold">Conectado con Siigo.</span>{" "}
            {ultima ? `Última sincronización: ${fechaHora(ultima.terminada_en ?? ultima.iniciada_en)} (${ultima.estado}).` : "Todavía no ha corrido ninguna sincronización."}
          </>
        ) : (
          <>
            <span className="font-semibold">Falta conectar Siigo.</span> Las pantallas ya tienen su forma y se llenan con la primera sincronización. Ver qué falta →
          </>
        )}
      </Link>
      <div className="space-y-3 lg:grid lg:grid-cols-3 lg:gap-3 lg:space-y-0">
        {tarjetas.map((t) => (
          <Link key={t.href} href={t.href} className="flex items-center gap-3 rounded-lg border border-slate-300 bg-white p-4 shadow-sm active:bg-slate-50">
            <span className="text-2xl">{t.icono}</span>
            <div>
              <p className="text-sm font-semibold text-slate-900">{t.nombre}</p>
              <p className="text-xs text-slate-600">{t.texto}</p>
            </div>
          </Link>
        ))}
      </div>
      <p className="mt-4 text-center text-xs text-slate-500">
        🔒 Todo aquí es de solo lectura. Se factura y se contabiliza en Siigo: el documento legal es el de Siigo.
      </p>
    </div>
  );
}
