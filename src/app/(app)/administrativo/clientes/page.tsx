import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { tienePermiso } from "@/lib/permisos";
import { COLUMNAS_CLIENTE, faltanParaFacturar, nitConDv, type ClienteFicha } from "@/lib/clientes-dian";
import { ExportarClientes } from "./ExportarClientes";

// Administrativo → Clientes: la lista de fichas. Sin montos (eso es Financiero).
export default async function ClientesAdministrativoPage({ searchParams }: { searchParams: Promise<{ q?: string; ver?: string }> }) {
  const { q, ver } = await searchParams;
  const busqueda = q?.trim() ?? "";
  const filtro = ver === "incompletos" || ver === "archivados" ? ver : "activos";
  const supabase = await createClient();
  const [edita, importa] = await Promise.all([
    Promise.all([tienePermiso("administrativo", "trabajar"), tienePermiso("comercial", "trabajar")]).then(([a, c]) => a || c),
    tienePermiso("administrativo", "trabajar"),
  ]);

  let consulta = supabase
    .from("clientes")
    .select(`${COLUMNAS_CLIENTE}, cliente_sedes(count)`)
    .eq("activo", filtro !== "archivados")
    .order("nombre")
    .limit(1000);
  if (busqueda) {
    const patron = `%${busqueda.replace(/[%_,()]/g, " ")}%`;
    consulta = consulta.or(`nombre.ilike.${patron},nit.ilike.${patron},municipio.ilike.${patron},contacto.ilike.${patron}`);
  }
  const { data, error } = await consulta;
  let clientes = (data ?? []) as (ClienteFicha & { cliente_sedes: { count: number }[] })[];
  if (filtro === "incompletos") clientes = clientes.filter((c) => faltanParaFacturar(c).length > 0);

  const pestanas = [
    { id: "activos", nombre: "Activos" },
    { id: "incompletos", nombre: "Les faltan datos para facturar" },
    { id: "archivados", nombre: "Archivados" },
  ];
  const enlace = (v: string) => `/administrativo/clientes?${new URLSearchParams({ ...(busqueda ? { q: busqueda } : {}), ...(v !== "activos" ? { ver: v } : {}) })}`;

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 p-4 sm:p-6 lg:max-w-6xl">
      <Link href="/administrativo" className="text-sm text-slate-600 underline">
        ← Administrativo
      </Link>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-bold text-slate-900">Clientes</h1>
        <div className="flex flex-wrap gap-2">
          {edita && (
            <Link href="/administrativo/clientes/nuevo" className="inline-flex min-h-11 items-center rounded-md bg-slate-900 px-3 text-sm font-semibold text-white">
              + Nuevo cliente
            </Link>
          )}
          {importa && (
            <Link href="/administrativo/clientes/importar" className="inline-flex min-h-11 items-center rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-800">
              📥 Importar de SIIGO
            </Link>
          )}
          <ExportarClientes clientes={clientes} />
        </div>
      </div>

      <form className="mt-3 flex gap-2">
        {filtro !== "activos" && <input type="hidden" name="ver" value={filtro} />}
        <input name="q" defaultValue={busqueda} placeholder="Nombre, NIT, municipio o contacto" className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-2 text-base" />
        <button type="submit" className="min-h-11 shrink-0 rounded-md bg-slate-900 px-3 text-sm font-medium text-white">
          Buscar
        </button>
      </form>
      <div className="mt-3 flex flex-wrap gap-2">
        {pestanas.map((p) => (
          <Link
            key={p.id}
            href={enlace(p.id)}
            className={`inline-flex min-h-11 items-center rounded-full border px-3 text-sm font-medium ${
              p.id === filtro ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 text-slate-700"
            }`}
          >
            {p.nombre}
          </Link>
        ))}
      </div>

      {error ? (
        <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">No se pudo cargar la lista de clientes: {error.message}</p>
      ) : clientes.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-600">
          {busqueda ? "Ningún cliente coincide con la búsqueda." : filtro === "incompletos" ? "Todos los clientes activos tienen los datos para facturar." : "No hay clientes aquí."}
        </p>
      ) : (
        <>
          <p className="mt-3 text-xs text-slate-600">
            {clientes.length} {clientes.length === 1 ? "cliente" : "clientes"}
          </p>
          <ul className="mt-1 space-y-2 lg:grid lg:grid-cols-2 lg:gap-2 lg:space-y-0">
            {clientes.map((c) => {
              const falta = faltanParaFacturar(c);
              const sedes = c.cliente_sedes?.[0]?.count ?? 0;
              return (
                <li key={c.id}>
                  <Link href={`/administrativo/clientes/${c.id}`} className="block rounded-lg border border-slate-200 bg-white p-3 shadow-sm active:bg-slate-50">
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 font-semibold text-slate-900">{c.nombre}</p>
                      {sedes > 0 && <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{sedes} {sedes === 1 ? "sede" : "sedes"}</span>}
                    </div>
                    <p className="text-xs text-slate-600">
                      {c.nit ? `NIT ${nitConDv(c)}` : "Sin NIT"}
                      {c.municipio ? ` · ${c.municipio}` : ""}
                      {c.contacto ? ` · ${c.contacto}` : ""}
                    </p>
                    {falta.length > 0 && <p className="mt-1 text-xs text-amber-800">Para facturar le falta: {falta.join(", ")}.</p>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
