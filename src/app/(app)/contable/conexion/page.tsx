import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { tienePermiso } from "@/lib/permisos";
import { fechaHora } from "@/lib/siigo";
import { ConfigSiigo, type Config } from "./ConfigSiigo";

interface Sincronizacion {
  id: string;
  recurso: string;
  desde: string | null;
  hasta: string | null;
  iniciada_en: string;
  terminada_en: string | null;
  filas: number | null;
  estado: "corriendo" | "ok" | "error" | "parcial";
  detalle: string | null;
}

const ESTADO: Record<Sincronizacion["estado"], { label: string; clase: string }> = {
  corriendo: { label: "Corriendo", clase: "bg-blue-100 text-blue-900" },
  ok: { label: "Bien", clase: "bg-green-100 text-green-900" },
  parcial: { label: "Parcial", clase: "bg-amber-100 text-amber-900" },
  error: { label: "Error", clase: "bg-red-100 text-red-900" },
};

/** Conexión con Siigo: qué falta para conectar (siigo_config) y el historial (siigo_sincronizaciones). */
export default async function ConexionPage() {
  const supabase = await createClient();
  const [cfgRes, sincRes, responsable] = await Promise.all([
    supabase.from("siigo_config").select("*").eq("id", 1).maybeSingle(),
    supabase.from("siigo_sincronizaciones").select("*").order("iniciada_en", { ascending: false }).limit(50),
    tienePermiso("contable", "responsable"),
  ]);
  const c = cfgRes.data as (Config & { activo: boolean; updated_at: string }) | null;
  const sinc = (sincRes.data ?? []) as Sincronizacion[];
  const pasos = c
    ? [
        { hecho: !!c.plan, texto: "Plan de Siigo confirmado", detalle: c.plan ?? "La API va en Profesional independiente, Emprendedor o Premium." },
        { hecho: !!c.usuario_api, texto: "Credenciales generadas con el usuario Administrador", detalle: c.usuario_api ?? "Falta el usuario de la API." },
        { hecho: !!c.partner_id, texto: "Aplicación registrada (Partner-Id)", detalle: c.partner_id ? "Registrado." : "Falta registrar la aplicación en Siigo." },
        { hecho: null, texto: "Clave de acceso guardada en Vault", detalle: "No se puede ver desde aquí, a propósito: la clave no se guarda en la tabla." },
        {
          hecho: c.cuentas_iva_generado.length > 0 && c.cuentas_iva_descontable.length > 0 && !!c.cuentas_confirmadas_en,
          texto: "Cuentas de IVA confirmadas con la contadora",
          detalle: c.cuentas_confirmadas_en
            ? `Confirmadas el ${fechaHora(c.cuentas_confirmadas_en)}.`
            : c.cuentas_iva_generado.length && c.cuentas_iva_descontable.length
              ? "Escritas pero sin confirmar."
              : "Sin configurar: la pantalla de IVA no muestra cifras hasta entonces.",
        },
        { hecho: c.activo, texto: "Sincronización encendida", detalle: c.activo ? "El proceso de sincronización está activo." : "Apagada. Se enciende cuando lo anterior esté listo." },
      ]
    : [];

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 space-y-3 p-4 sm:p-6">
      <Link href="/contable" className="text-sm text-slate-600 underline">
        ← Contable
      </Link>
      <h1 className="text-lg font-bold text-slate-900">Conexión con Siigo</h1>
      <p className="text-xs text-slate-600">
        El ERP solo lee de Siigo. La sincronización escribe en el espejo; nadie desde la app puede hacerlo. Esta configuración es lo único que se edita aquí.
      </p>
      {!c ? (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">No se pudo leer la configuración{cfgRes.error ? `: ${cfgRes.error.message}` : "."}</p>
      ) : (
        <>
          <section className="rounded-lg border border-slate-300 bg-white p-3">
            <h2 className="text-sm font-bold text-slate-900">Qué falta para conectar</h2>
            <ul className="mt-2 space-y-2">
              {pasos.map((p) => (
                <li key={p.texto} className="flex gap-2 text-sm">
                  <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${p.hecho === null ? "bg-slate-200 text-slate-600" : p.hecho ? "bg-green-600 text-white" : "border-2 border-slate-400"}`}>
                    {p.hecho === null ? "?" : p.hecho ? "✓" : ""}
                  </span>
                  <span>
                    <span className={p.hecho ? "text-slate-700" : "font-semibold text-slate-900"}>{p.texto}</span>
                    <span className="block text-xs text-slate-600">{p.detalle}</span>
                  </span>
                </li>
              ))}
            </ul>
            {c.notas && <p className="mt-3 whitespace-pre-wrap rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-700">{c.notas}</p>}
            <p className="mt-2 text-xs text-slate-500">
              Periodicidad del IVA: {c.periodicidad_iva} · última modificación {fechaHora(c.updated_at)}
            </p>
          </section>
          {responsable ? <ConfigSiigo c={c} /> : <p className="text-xs text-slate-600">Solo quien es responsable de Contable puede cambiar esta configuración.</p>}
        </>
      )}

      <section className="rounded-lg border border-slate-300 bg-white p-3">
        <h2 className="text-sm font-bold text-slate-900">Historial de sincronizaciones</h2>
        {sincRes.error && <p className="text-sm text-amber-900">No se pudo leer: {sincRes.error.message}</p>}
        {!sinc.length ? (
          <p className="py-3 text-center text-sm text-slate-500">Todavía no ha corrido ninguna.</p>
        ) : (
          <ul className="mt-1 divide-y divide-slate-100">
            {sinc.map((s) => (
              <li key={s.id} className="py-2 text-sm">
                <div className="flex items-start gap-2">
                  <span className="min-w-0 flex-1">
                    <span className="font-semibold">{s.recurso}</span>
                    {(s.desde || s.hasta) && <span className="text-xs text-slate-600"> · {s.desde ?? "…"} a {s.hasta ?? "…"}</span>}
                    <span className="block text-xs text-slate-600">
                      {fechaHora(s.iniciada_en)}
                      {s.terminada_en && ` → ${fechaHora(s.terminada_en)}`}
                      {s.filas != null && ` · ${s.filas.toLocaleString("es-CO")} filas`}
                    </span>
                  </span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${ESTADO[s.estado]?.clase}`}>{ESTADO[s.estado]?.label ?? s.estado}</span>
                </div>
                {s.detalle && <p className={`mt-1 whitespace-pre-wrap text-xs ${s.estado === "error" ? "text-red-800" : "text-slate-600"}`}>{s.detalle}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
