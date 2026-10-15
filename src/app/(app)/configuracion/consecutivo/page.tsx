import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { tienePermiso } from "@/lib/permisos";
import { AjusteConsecutivo } from "./AjusteConsecutivo";

interface EstadoConsecutivo {
  anio: number;
  ultimoNumero: number;
  mayorEmitido: number;
}

interface AjusteHistorial {
  id: string;
  anio: number;
  numeroAnterior: number | null;
  numeroNuevo: number;
  motivo: string;
  ajustadoPor: string | null;
  ajustadoEn: string;
}

/** CSE-AA-NNN, igual que fn_siguiente_codigo_cotizacion. */
function codigoCotizacion(anio: number, numero: number): string {
  return `CSE-${String(anio % 100).padStart(2, "0")}-${String(numero).padStart(3, "0")}`;
}

export default async function ConsecutivoPage() {
  const supabase = await createClient();
  const [estadoRes, historialRes, puedeAjustar] = await Promise.all([
    supabase.rpc("fn_estado_consecutivos"),
    supabase
      .from("cotizacion_consecutivos_ajustes")
      .select("id, anio, numero_anterior, numero_nuevo, motivo, ajustado_por_nombre, ajustado_en")
      .order("ajustado_en", { ascending: false })
      .limit(30),
    tienePermiso("configuracion", "responsable"),
  ]);

  const estados: EstadoConsecutivo[] = (
    (estadoRes.data ?? []) as { anio: number; ultimo_numero: number; mayor_emitido: number }[]
  ).map((e) => ({ anio: e.anio, ultimoNumero: e.ultimo_numero, mayorEmitido: e.mayor_emitido }));

  const historial: AjusteHistorial[] = (
    (historialRes.data ?? []) as {
      id: string;
      anio: number;
      numero_anterior: number | null;
      numero_nuevo: number;
      motivo: string;
      ajustado_por_nombre: string | null;
      ajustado_en: string;
    }[]
  ).map((h) => ({
    id: h.id,
    anio: h.anio,
    numeroAnterior: h.numero_anterior,
    numeroNuevo: h.numero_nuevo,
    motivo: h.motivo,
    ajustadoPor: h.ajustado_por_nombre,
    ajustadoEn: h.ajustado_en,
  }));

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 p-4 sm:p-6">
      <Link href="/configuracion" className="text-sm text-slate-600">
        ← Configuración
      </Link>
      <h1 className="mb-1 mt-2 text-center text-sm font-bold text-slate-900 sm:text-base">
        Consecutivo de cotizaciones
      </h1>
      <p className="mb-4 text-center text-xs text-slate-600">
        El número que toma la próxima cotización al guardarse. Cada cambio queda registrado.
      </p>

      {estadoRes.error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          No se pudo leer el consecutivo: {estadoRes.error.message}
          {/does not exist|Could not find/i.test(estadoRes.error.message) &&
            " — falta correr la migración 44 en la base."}
        </p>
      ) : (
        <div className="space-y-3">
          {estados.map((e) => (
            <div key={e.anio} className="rounded-lg border border-slate-300 bg-white p-4 shadow-sm">
              <p className="text-sm font-semibold text-slate-900">Año {e.anio}</p>
              <div className="mt-2 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-slate-600">Último usado</p>
                  <p className="font-mono text-base text-slate-900">
                    {e.ultimoNumero > 0 ? codigoCotizacion(e.anio, e.ultimoNumero) : "ninguno"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-600">Próximo a emitir</p>
                  <p className="font-mono text-base font-semibold text-slate-900">
                    {codigoCotizacion(e.anio, e.ultimoNumero + 1)}
                  </p>
                </div>
              </div>
              {e.mayorEmitido > 0 && (
                <p className="mt-2 text-xs text-slate-500">
                  Mayor código guardado en el ERP: {codigoCotizacion(e.anio, e.mayorEmitido)}
                </p>
              )}
              {puedeAjustar && (
                <AjusteConsecutivo
                  anio={e.anio}
                  ultimoNumero={e.ultimoNumero}
                  mayorEmitido={e.mayorEmitido}
                />
              )}
            </div>
          ))}
          {!puedeAjustar && (
            <p className="text-xs text-slate-500">
              Solo un responsable de Configuración puede cambiar el consecutivo.
            </p>
          )}
        </div>
      )}

      <h2 className="mb-2 mt-6 text-sm font-semibold text-slate-900">Historial de cambios</h2>
      {historial.length === 0 ? (
        <p className="text-sm text-slate-500">Sin cambios registrados.</p>
      ) : (
        <ul className="divide-y divide-slate-200 rounded-lg border border-slate-300 bg-white">
          {historial.map((h) => (
            <li key={h.id} className="p-3 text-sm">
              <p className="text-slate-900">
                <span className="font-mono">
                  {h.numeroAnterior === null ? "—" : codigoCotizacion(h.anio, h.numeroAnterior)}
                </span>{" "}
                → <span className="font-mono font-semibold">{codigoCotizacion(h.anio, h.numeroNuevo)}</span>
              </p>
              <p className="text-xs text-slate-600">
                {h.ajustadoPor ?? "Usuario sin nombre"} ·{" "}
                {new Date(h.ajustadoEn).toLocaleString("es-CO", { timeZone: "America/Bogota" })}
              </p>
              <p className="mt-0.5 text-xs text-slate-700">{h.motivo}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
