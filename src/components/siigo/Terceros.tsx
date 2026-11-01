import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { corteDe } from "@/lib/siigo";
import { EncabezadoSiigo } from "./Corte";

interface Tercero {
  siigo_id: string;
  identificacion: string;
  dv: string | null;
  nombre: string;
  nombre_comercial: string | null;
  ciudad: string | null;
  telefono: string | null;
  correo: string | null;
  activo: boolean;
  cliente_id: string | null;
}

/** Clientes o proveedores tal como los tiene Siigo (siigo_terceros). Solo lectura. */
export async function TercerosSiigo({ rol, q }: { rol: "cliente" | "proveedor"; q: string }) {
  const supabase = await createClient();
  let consulta = supabase
    .from("siigo_terceros")
    .select("siigo_id, identificacion, dv, nombre, nombre_comercial, ciudad, telefono, correo, activo, cliente_id")
    .eq(rol === "cliente" ? "es_cliente" : "es_proveedor", true)
    .order("nombre")
    .limit(300);
  const limpio = q.replace(/[%,()]/g, " ").trim();
  if (limpio) consulta = consulta.or(`nombre.ilike.%${limpio}%,identificacion.ilike.%${limpio}%,nombre_comercial.ilike.%${limpio}%`);
  const [al, res] = await Promise.all([corteDe(supabase, "siigo_terceros"), consulta]);
  const filas = (res.data ?? []) as Tercero[];
  const base = rol === "cliente" ? "/contable/clientes" : "/contable/proveedores";

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 space-y-3 p-4 sm:p-6 lg:max-w-5xl">
      <EncabezadoSiigo volver="contable" titulo={rol === "cliente" ? "Clientes en Siigo" : "Proveedores en Siigo"} al={al}>
        {rol === "cliente"
          ? "Los terceros marcados como cliente en Siigo. Si no aparecen en el ERP, la cotización y el proyecto no se pueden cruzar con sus facturas."
          : "Los terceros marcados como proveedor en Siigo."}
      </EncabezadoSiigo>
      {al && (
        <form action={base} className="flex gap-2">
          <input name="q" defaultValue={q} placeholder="Nombre o NIT" className="min-h-11 flex-1 rounded-lg border border-slate-300 bg-white px-3 text-base" />
          <button className="min-h-11 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white">Buscar</button>
        </form>
      )}
      {res.error && <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">No se pudo leer: {res.error.message}</p>}
      {al && !filas.length && <p className="py-6 text-center text-sm text-slate-500">{limpio ? "Nada coincide con la búsqueda." : "Siigo no tiene terceros con este rol."}</p>}
      {filas.length > 0 && (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-300 bg-white">
          {filas.map((t) => (
            <li key={t.siigo_id} className={`flex flex-wrap items-start gap-2 p-3 ${t.activo ? "" : "opacity-60"}`}>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-900">
                  {t.nombre}
                  {!t.activo && " (inactivo en Siigo)"}
                </p>
                <p className="text-xs text-slate-600">
                  {[`NIT ${t.identificacion}${t.dv ? `-${t.dv}` : ""}`, t.nombre_comercial, t.ciudad, t.telefono, t.correo].filter(Boolean).join(" · ")}
                </p>
              </div>
              {rol === "cliente" &&
                (t.cliente_id ? (
                  <Link href={`/administrativo/clientes/${t.cliente_id}`} className="shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-900">
                    En el ERP →
                  </Link>
                ) : (
                  <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">No está en el ERP</span>
                ))}
            </li>
          ))}
        </ul>
      )}
      {filas.length === 300 && <p className="text-center text-xs text-slate-500">Se muestran los primeros 300: buscar por nombre o NIT para afinar.</p>}
    </div>
  );
}
