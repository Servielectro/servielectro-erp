import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

// CRM → Clientes: la cartera con cuántas cotizaciones tiene cada uno.
// Los clientes se crean solos al guardar cotizaciones (o al leer un RUT).
export default async function CrmClientesPage(props: PageProps<"/comercial/crm/clientes">) {
  const { q } = await props.searchParams;
  const busqueda = (Array.isArray(q) ? q[0] : q)?.trim() ?? "";

  const supabase = await createClient();
  let consulta = supabase
    .from("clientes")
    .select("id, nombre, nit, contacto, telefono, email, cotizaciones(count)")
    .eq("activo", true)
    .order("nombre");
  if (busqueda) {
    const patron = `%${busqueda.replace(/[%_,()]/g, " ")}%`;
    consulta = consulta.or(`nombre.ilike.${patron},nit.ilike.${patron}`);
  }
  const { data, error } = await consulta;

  const clientes = (data ?? []) as {
    id: string;
    nombre: string;
    nit: string | null;
    contacto: string | null;
    telefono: string | null;
    email: string | null;
    cotizaciones: { count: number }[];
  }[];

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 p-4 sm:p-6">
      <Link href="/comercial/crm" className="mb-2 inline-block text-sm text-slate-600">
        ← CRM
      </Link>
      <h1 className="mb-4 text-center text-sm font-bold text-slate-900">
        CRM — Clientes
      </h1>

      <form className="mb-4 flex gap-2">
        <input
          name="q"
          defaultValue={busqueda}
          placeholder="Buscar por nombre o NIT"
          className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="shrink-0 rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white"
        >
          Buscar
        </button>
      </form>

      {error && (
        <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          No se pudo cargar la lista de clientes ({error.message}).
        </p>
      )}

      {!error && clientes.length === 0 && (
        <p className="py-10 text-center text-sm text-slate-600">
          {busqueda ? "Ningún cliente coincide con la búsqueda." : "Todavía no hay clientes."}
        </p>
      )}

      <div className="space-y-2">
        {clientes.map((c) => {
          const n = c.cotizaciones?.[0]?.count ?? 0;
          return (
            <div key={c.id} className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">{c.nombre}</p>
                  {c.nit && <p className="text-xs text-slate-500">NIT {c.nit}</p>}
                </div>
                <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                  {n} {n === 1 ? "cotización" : "cotizaciones"}
                </span>
              </div>
              {(c.contacto || c.telefono || c.email) && (
                <p className="mt-1 text-xs text-slate-600">
                  {[c.contacto, c.telefono, c.email].filter(Boolean).join(" · ")}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
