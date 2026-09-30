import Link from "next/link";

// Comercial = dos submódulos: Cotizaciones (con el catálogo de ítems colgando de ahí,
// porque es su insumo) y CRM (por ahora, la cartera de clientes).
export default function ComercialPage() {
  return (
    <div className="mx-auto w-full max-w-3xl flex-1 p-4 sm:p-6">
      <h1 className="mb-4 text-center text-sm font-bold text-slate-900 sm:text-base">
        Comercial
      </h1>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <Link href="/comercial/cotizaciones" className="flex items-center gap-3">
            <span className="text-3xl">🧾</span>
            <div>
              <p className="text-base font-semibold text-slate-900">Cotizaciones</p>
              <p className="text-xs text-slate-600">Armar, consultar y duplicar cotizaciones</p>
            </div>
          </Link>
          <div className="mt-4 flex flex-col gap-2">
            <Link
              href="/comercial/cotizaciones/nueva"
              className="rounded-md bg-brand-red px-3 py-2.5 text-center text-sm font-semibold text-white"
            >
              + Nueva cotización
            </Link>
            <Link
              href="/comercial/cotizaciones"
              className="rounded-md border border-slate-300 px-3 py-2 text-center text-sm font-medium text-slate-700"
            >
              Ver cotizaciones
            </Link>
            <Link
              href="/comercial/catalogo"
              className="py-1 text-center text-xs font-medium text-slate-500 underline"
            >
              Catálogo de ítems
            </Link>
          </div>
        </div>

        <Link
          href="/comercial/crm"
          className="flex flex-col rounded-lg border border-slate-200 bg-white p-4 shadow-sm active:bg-slate-50"
        >
          <div className="flex items-center gap-3">
            <span className="text-3xl">🤝</span>
            <div>
              <p className="text-base font-semibold text-slate-900">CRM</p>
              <p className="text-xs text-slate-600">Pipeline de negocios, seguimientos y clientes</p>
            </div>
          </div>
        </Link>
      </div>
    </div>
  );
}
