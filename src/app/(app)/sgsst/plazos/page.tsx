import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { tienePermiso } from "@/lib/permisos";
import type { Plazo } from "@/lib/sst/plazos";
import { RegistrarPlazo } from "./RegistrarPlazo";

// Plazos de reporte e investigación (migración 77). Sin ningún número de ley en el código: los
// registra la gestión SST con su vigencia y su fuente. Un valor registrado no se cambia.
export default async function PlazosPage() {
  const supabase = await createClient();
  const [plazosRes, historialRes, gestiona] = await Promise.all([
    supabase.rpc("fn_sst_plazos"),
    supabase.from("sst_parametro_valores").select("id, clave, vigente_desde, dias, tipo_dias, nota, registrado_en").order("vigente_desde", { ascending: false }),
    tienePermiso("sgsst", "responsable"),
  ]);
  const plazos = (plazosRes.data ?? []) as Plazo[];
  const historial = (historialRes.data ?? []) as { id: string; clave: string; vigente_desde: string; dias: number; tipo_dias: string; nota: string | null }[];
  return (
    <div className="mx-auto w-full max-w-3xl flex-1 space-y-3 p-4 sm:p-6">
      <Link href="/sgsst" className="text-sm text-slate-600 underline">
        ← SG-SST
      </Link>
      <h1 className="text-lg font-bold text-slate-900">Plazos de reporte e investigación</h1>
      <p className="text-sm text-slate-600">
        Los define la responsable SST con la norma vigente; el ERP no trae ninguno escrito. Con ellos, cada accidente cuenta los días que quedan. Si la norma cambia, se
        registra el nuevo con su fecha de vigencia: el anterior se conserva.
      </p>
      {plazosRes.error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">No se pudieron leer: {plazosRes.error.message}</p>}
      <ul className="space-y-2">
        {plazos.map((p) => (
          <li key={p.clave} className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
            <p className="font-semibold">{p.nombre}</p>
            {p.dias ? (
              <p>
                {p.dias} días {p.tipo_dias === "habiles" ? "hábiles" : "calendario"} · vigente desde {p.vigente_desde}
              </p>
            ) : (
              <p className="text-amber-800">Sin configurar.</p>
            )}
            {historial.filter((h) => h.clave === p.clave).length > 1 && (
              <details className="mt-1 text-xs text-slate-600">
                <summary className="cursor-pointer">Historial</summary>
                {historial
                  .filter((h) => h.clave === p.clave)
                  .map((h) => (
                    <p key={h.id}>
                      Desde {h.vigente_desde}: {h.dias} {h.tipo_dias === "habiles" ? "hábiles" : "calendario"}
                      {h.nota ? ` · ${h.nota}` : ""}
                    </p>
                  ))}
              </details>
            )}
            {gestiona && <RegistrarPlazo clave={p.clave} />}
          </li>
        ))}
      </ul>
      {!gestiona && <p className="text-sm text-slate-500">Registrar plazos lo hace la gestión SST (nivel “responsable”).</p>}
    </div>
  );
}
