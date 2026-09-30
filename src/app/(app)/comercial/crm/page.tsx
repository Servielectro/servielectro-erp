import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getEtapas, getTablero, type TarjetaOportunidad } from "@/lib/supabase/crm";
import { MOTIVO_LABEL, PIPELINE_LABEL, type TipoPipeline } from "@/lib/crm";
import { formatCOP } from "@/lib/pricing";

// Tablero del pipeline. Lo primero que se ve es lo que necesita atención: con 10-15
// proyectos al año el valor no está en administrar volumen sino en que no se caiga
// ninguno por olvido.
export default async function CrmPage(props: PageProps<"/comercial/crm">) {
  const { p } = await props.searchParams;
  const tipo: TipoPipeline = p === "renovacion" ? "renovacion" : "proyecto_nuevo";

  const supabase = await createClient();
  // Renovaciones automáticas: crea las que vencen en los próximos 90 días (migración 28).
  // Idempotente; si la migración todavía no se corrió, simplemente no hace nada.
  await supabase.rpc("fn_crear_renovaciones_pendientes");
  let error: string | null = null;
  let etapas: Awaited<ReturnType<typeof getEtapas>> = [];
  let tarjetas: TarjetaOportunidad[] = [];
  try {
    etapas = await getEtapas(supabase);
    tarjetas = await getTablero(supabase, tipo, etapas);
  } catch (err) {
    error = err instanceof Error ? err.message : "Error desconocido";
  }

  const etapasPipeline = etapas.filter((e) => e.tipoPipeline === tipo);
  const abiertas = etapasPipeline.filter((e) => !e.resultado);
  const etapaNombre = new Map(etapas.map((e) => [e.id, e.nombre]));
  const activas = tarjetas.filter((t) => t.estado === "activa");
  const aplazadas = tarjetas.filter((t) => t.estado === "aplazada");
  const cerradas = tarjetas.filter((t) => t.estado === "cerrada");
  const ganadaIds = new Set(etapasPipeline.filter((e) => e.resultado === "ganada").map((e) => e.id));

  const atencion = [
    ...activas.filter((t) => t.semaforo === "rojo").map((t) => ({ t, motivo: `Estancada: ${t.diasEnEtapa} días en ${etapaNombre.get(t.etapaId)}`, nivel: "rojo" as const })),
    ...activas.filter((t) => t.contactoVencido).map((t) => ({ t, motivo: `Seguimiento vencido (era para el ${fecha(t.proximoContacto)})`, nivel: "rojo" as const })),
    ...aplazadas.filter((t) => t.reactivacionVencida).map((t) => ({ t, motivo: `Hay que retomarla (aplazada hasta el ${fecha(t.fechaReactivacion)})`, nivel: "amarillo" as const })),
    ...activas.filter((t) => t.semaforo === "amarillo").map((t) => ({ t, motivo: `${t.diasEnEtapa} días en ${etapaNombre.get(t.etapaId)}`, nivel: "amarillo" as const })),
    ...activas.filter((t) => t.sinSeguimiento).map((t) => ({ t, motivo: "Sin ningún seguimiento programado", nivel: "amarillo" as const })),
  ];

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 p-4 sm:p-6">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Link href="/comercial" className="text-sm text-slate-600">
          ← Comercial
        </Link>
        <h1 className="flex-1 text-center text-sm font-bold text-slate-900 sm:text-base">
          CRM — Pipeline
        </h1>
        <Link href="/comercial/crm/clientes" className="text-sm text-slate-600 underline">
          Clientes
        </Link>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {(["proyecto_nuevo", "renovacion"] as const).map((t) => (
          <Link
            key={t}
            href={t === "proyecto_nuevo" ? "/comercial/crm" : "/comercial/crm?p=renovacion"}
            className={`rounded-full border px-3 py-1.5 text-sm ${
              t === tipo ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700"
            }`}
          >
            {PIPELINE_LABEL[t]}
          </Link>
        ))}
        <span className="flex-1" />
        <Link
          href={`/comercial/crm/nueva${tipo === "renovacion" ? "?p=renovacion" : ""}`}
          className="rounded-md bg-brand-red px-4 py-2 text-sm font-semibold text-white"
        >
          + Nuevo negocio
        </Link>
      </div>

      {error && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          No se pudo cargar el pipeline ({error}).
        </p>
      )}

      {/* ---------------- Requiere atención ---------------- */}
      <section className="mb-5">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Requiere atención {atencion.length > 0 && `(${atencion.length})`}
        </h2>
        {atencion.length === 0 ? (
          <p className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
            {activas.length + aplazadas.length === 0
              ? "No hay negocios abiertos en este pipeline."
              : "Todo al día: ningún negocio estancado ni sin seguimiento."}
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
            {atencion.map(({ t, motivo, nivel }, i) => (
              <li key={`${t.id}-${i}`}>
                <Link href={`/comercial/crm/${t.id}`} className="flex items-center gap-3 px-3 py-2.5 active:bg-slate-50">
                  <Punto nivel={nivel} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">
                      {t.nombre} <span className="font-normal text-slate-500">· {t.clienteNombre}</span>
                    </p>
                    <p className="text-xs text-slate-600">{motivo}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ---------------- Tablero ---------------- */}
      <section className="mb-5">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          En curso ({activas.length})
        </h2>
        <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
          <div className="flex gap-3">
            {abiertas.map((e) => {
              const deEtapa = activas.filter((t) => t.etapaId === e.id);
              const cotizado = deEtapa.reduce((a, t) => a + (t.valorEsCotizado ? (t.valor ?? 0) : 0), 0);
              const estimado = deEtapa.reduce((a, t) => a + (!t.valorEsCotizado ? (t.valor ?? 0) : 0), 0);
              return (
                <div key={e.id} className="w-60 shrink-0 rounded-lg bg-slate-100 p-2">
                  <div className="mb-2 px-1">
                    <p className="text-xs font-semibold text-slate-800">
                      {e.nombre} <span className="font-normal text-slate-500">({deEtapa.length})</span>
                    </p>
                    {cotizado > 0 && <p className="text-[11px] text-slate-700">{formatCOP(cotizado)} cotizado</p>}
                    {estimado > 0 && <p className="text-[11px] text-slate-400">~{formatCOP(estimado)} estimado</p>}
                  </div>
                  <div className="space-y-2">
                    {deEtapa.map((t) => (
                      <Tarjeta key={t.id} t={t} />
                    ))}
                    {deEtapa.length === 0 && <p className="px-1 py-2 text-[11px] text-slate-400">—</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {aplazadas.length > 0 && (
        <section className="mb-5">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Aplazadas ({aplazadas.length})
          </h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {aplazadas.map((t) => (
              <Tarjeta key={t.id} t={t} etapa={etapaNombre.get(t.etapaId)} />
            ))}
          </div>
        </section>
      )}

      {cerradas.length > 0 && (
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Cerradas en los últimos 90 días
          </h2>
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
            {cerradas.map((t) => {
              const ganada = ganadaIds.has(t.etapaId);
              return (
                <li key={t.id}>
                  <Link href={`/comercial/crm/${t.id}`} className="flex items-center gap-3 px-3 py-2 active:bg-slate-50">
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        ganada ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                      }`}
                    >
                      {etapaNombre.get(t.etapaId)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-slate-900">
                        {t.nombre} <span className="text-slate-500">· {t.clienteNombre}</span>
                      </p>
                      {!ganada && t.motivoPerdida && (
                        <p className="truncate text-xs text-slate-500">{MOTIVO_LABEL[t.motivoPerdida]}</p>
                      )}
                    </div>
                    {t.valor !== null && (
                      <span className={`shrink-0 text-xs ${t.valorEsCotizado ? "text-slate-600" : "text-slate-400"}`}>
                        {t.valorEsCotizado ? "" : "~"}
                        {formatCOP(t.valor)}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}

function fecha(iso: string | null) {
  if (!iso) return "—";
  return new Date(`${iso}T12:00:00`).toLocaleDateString("es-CO", { day: "numeric", month: "short" });
}

function Punto({ nivel }: { nivel: "verde" | "amarillo" | "rojo" }) {
  const color = nivel === "rojo" ? "bg-red-500" : nivel === "amarillo" ? "bg-amber-400" : "bg-green-500";
  return <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${color}`} aria-hidden="true" />;
}

function Tarjeta({ t, etapa }: { t: TarjetaOportunidad; etapa?: string }) {
  return (
    <Link
      href={`/comercial/crm/${t.id}`}
      className="block rounded-md border border-slate-200 bg-white p-2.5 shadow-sm active:bg-slate-50"
    >
      <p className="text-sm font-medium leading-tight text-slate-900">{t.nombre}</p>
      <p className="truncate text-xs text-slate-500">{t.clienteNombre}</p>
      {t.valor !== null &&
        (t.valorEsCotizado ? (
          <p className="mt-1 text-xs font-medium text-slate-700">{formatCOP(t.valor)} cotizado</p>
        ) : (
          <p className="mt-1 text-xs text-slate-400">~{formatCOP(t.valor)} estimado</p>
        ))}
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
        {t.estado === "aplazada" ? (
          <span className={`rounded-full px-2 py-0.5 ${t.reactivacionVencida ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600"}`}>
            {etapa ? `${etapa} · ` : ""}retomar el {fecha(t.fechaReactivacion)}
          </span>
        ) : (
          <>
            <span className="flex items-center gap-1 text-slate-600">
              <Punto nivel={t.semaforo} />
              {t.diasEnEtapa} {t.diasEnEtapa === 1 ? "día" : "días"}
            </span>
            {t.proximoContacto ? (
              <span className={t.contactoVencido ? "text-red-700" : "text-slate-500"}>
                · seguimiento {fecha(t.proximoContacto)}
              </span>
            ) : (
              <span className="text-amber-700">· sin seguimiento</span>
            )}
          </>
        )}
      </div>
    </Link>
  );
}
