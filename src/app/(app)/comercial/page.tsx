import Link from "next/link";

export default function ComercialPage() {
  return (
    <div className="mx-auto w-full max-w-3xl flex-1 p-4 sm:p-6">
      <h1 className="mb-4 text-center text-sm font-bold text-slate-900 sm:text-base">
        Comercial
      </h1>

      <div className="space-y-3">
        <Link
          href="/comercial/cotizaciones/nueva"
          className="block rounded-lg bg-brand-red px-4 py-4 text-center text-base font-semibold text-white shadow-sm"
        >
          + Nueva cotización
        </Link>
        <Link
          href="/comercial/cotizaciones"
          className="block rounded-lg border border-slate-300 bg-white px-4 py-3 text-center text-sm font-medium text-slate-700"
        >
          Ver cotizaciones
        </Link>
        <Link
          href="/comercial/catalogo"
          className="block rounded-lg border border-slate-300 bg-white px-4 py-3 text-center text-sm font-medium text-slate-700"
        >
          Catálogo de ítems
        </Link>
        <div className="rounded-lg border border-dashed border-slate-200 bg-slate-100 px-4 py-3 text-center opacity-60">
          <p className="text-sm font-medium text-slate-500">
            Clientes (CRM)
          </p>
          <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-500">
            Próximamente
          </span>
        </div>
      </div>
    </div>
  );
}
