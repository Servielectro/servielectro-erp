import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requierePermiso } from "@/lib/permisos";
import { fechaCorta } from "@/lib/rrhh-registros";
import { ImportarSiigo } from "./ImportarSiigo";

// Importar clientes del Excel de SIIGO (migración 70). Solo Administrativo "trabajar".
// Subir → confirmar qué columna va a qué campo → vista previa (nuevo / se actualiza y qué
// cambia / con error) → importar. La base vuelve a revisar todo y es todo o nada.
export default async function ImportarClientesPage() {
  await requierePermiso("administrativo", "trabajar");
  const supabase = await createClient();
  const { data: historial } = await supabase
    .from("importaciones_clientes")
    .select("id, archivo_nombre, filas, creados, actualizados, importado_en")
    .order("importado_en", { ascending: false })
    .limit(10);
  return (
    <div className="mx-auto w-full max-w-3xl flex-1 space-y-4 p-4 sm:p-6 lg:max-w-6xl">
      <div>
        <Link href="/administrativo/clientes" className="text-sm text-slate-600 underline">
          ← Clientes
        </Link>
        <h1 className="mt-2 text-lg font-bold text-slate-900">Importar clientes de SIIGO</h1>
        <p className="text-sm text-slate-600">
          Nada se guarda hasta que revises la vista previa y confirmes. Si un cliente ya está (mismo NIT), se actualiza solo con lo que trae el
          Excel: lo que el Excel no trae —la ubicación GPS, las sedes, un correo que SIIGO no tenga— no se borra.
        </p>
      </div>
      <ImportarSiigo />
      {historial && historial.length > 0 && (
        <section className="rounded-lg border border-slate-200 bg-white p-3">
          <h2 className="mb-1 text-sm font-bold text-slate-900">Importaciones anteriores</h2>
          <ul className="space-y-1 text-sm text-slate-700">
            {historial.map((h) => (
              <li key={h.id}>
                {fechaCorta(h.importado_en)} · {h.archivo_nombre ?? "sin nombre"} · {h.filas} filas: {h.creados} nuevos, {h.actualizados} actualizados
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
