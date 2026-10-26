import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getEtapas, getListaCrm, getResponsablesCrm, getTablero, type TarjetaOportunidad } from "@/lib/supabase/crm";
import { hoyColombia, MOTIVO_LABEL, PIPELINE_LABEL, type TipoPipeline } from "@/lib/crm";
import { formatCOP } from "@/lib/pricing";
import {
  aParams,
  ATAJOS,
  CAMPOS_FECHA,
  filtrar,
  GRUPOS,
  hayFiltros,
  leerFiltros,
  NOMBRE_GRUPO,
  NOMBRE_ORIGEN,
  type FilaCrm,
  type FiltrosCrm,
} from "@/lib/crm-filtros";
import { ExportarCrm, PanelFiltrosCrm } from "./FiltrosCrm";

// Tablero del pipeline. Lo primero que se ve es lo que necesita atención: con 10-15
// proyectos al año el valor no está en administrar volumen sino en que no se caiga
// ninguno por olvido.
export default async function CrmPage(props: PageProps<"/comercial/crm">) {
  const sp = await props.searchParams;
  const { p } = sp;
  const tipo: TipoPipeline = p === "renovacion" ? "renovacion" : "proyecto_nuevo";
  // Filtros (pedido de Jhojan, 2026-10-25): todos en la URL.
  const filtros = leerFiltros(sp);
  const filtrando = hayFiltros(filtros);
  const base: Record<string, string> = tipo === "renovacion" ? { p: "renovacion" } : {};

  const supabase = await createClient();
  // Renovaciones automáticas: crea las que vencen en los próximos 90 días (migración 28).
  // Idempotente; si la migración todavía no se corrió, simplemente no hace nada.
  await supabase.rpc("fn_crear_renovaciones_pendientes");
  let error: string | null = null;
  let etapas: Awaited<ReturnType<typeof getEtapas>> = [];
  let tarjetas: TarjetaOportunidad[] = [];
  let lista: FilaCrm[] = [];
  let conOrigen = false;
  let responsables: { id: string; nombre: string }[] = [];
  try {
    etapas = await getEtapas(supabase);
    [tarjetas, { filas: lista, conOrigen }, responsables] = await Promise.all([
      getTablero(supabase, tipo, etapas),
      getListaCrm(supabase, tipo, etapas),
      getResponsablesCrm(supabase),
    ]);
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

  const hoy = hoyColombia();
  const paraContar = filtrar(lista, filtros, hoy, "grupo");
  const resultado = filtrar(lista, filtros, hoy);
  const nombreResponsable = Object.fromEntries(responsables.map((r) => [r.id, r.nombre]));
  // Si todavía no corrió la migración 74 no hay nombres: al menos los ids que aparecen.
  const opcionesResponsable = responsables.length
    ? responsables
    : [...new Set(lista.map((o) => o.responsableId).filter((x): x is string => !!x))].map((id, i) => ({ id, nombre: `Responsable ${i + 1}` }));
  const opcionesCliente = [...new Map(lista.map((o) => [o.clienteId, o.clienteNombre])).entries()]
    .map(([id, nombre]) => ({ id, nombre }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  const activos = describirFiltros(filtros, {
    cliente: Object.fromEntries(opcionesCliente.map((c) => [c.id, c.nombre])),
    responsable: Object.fromEntries(opcionesResponsable.map((r) => [r.id, r.nombre])),
  });
  const sinEste = (clave: keyof FiltrosCrm, vacio: unknown) => `/comercial/crm?${aParams({ ...filtros, [clave]: vacio, ...(clave === "atajo" ? { desde: null, hasta: null } : {}) }, base)}`;

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
        <h1 className="flex-1 text-center text-sm font-bold text-slate-900">
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

      {/* ---------------- Los 8 estados: son también el filtro ---------------- */}
      <section className="mb-3">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
          {GRUPOS.map((g) => {
            const n = paraContar.filter((o) => o.grupo === g.id).length;
            const elegido = filtros.grupo === g.id;
            return (
              <Link
                key={g.id}
                href={`/comercial/crm?${aParams({ ...filtros, grupo: elegido ? null : g.id }, base)}`}
                aria-pressed={elegido}
                className={`flex min-h-14 flex-col justify-center rounded-lg border px-2 py-1.5 text-left ${
                  elegido ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-800 active:bg-slate-50"
                }`}
              >
                <span className="text-lg font-bold leading-tight">{n}</span>
                <span className="text-xs leading-tight">{g.nombre}</span>
              </Link>
            );
          })}
        </div>
        <p className="mt-1 text-xs text-slate-500">
          Toca un estado para ver solo esos; tócalo otra vez para quitarlo. Los números ya cuentan con los demás filtros puestos.
          {filtros.grupo && ` ${GRUPOS.find((g) => g.id === filtros.grupo)?.ayuda}`}
        </p>
      </section>

      {filtrando && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <span className="font-semibold">Filtro activo:</span>
          {activos.map((a) => (
            <Link key={a.clave} href={sinEste(a.clave, a.vacio)} className="inline-flex min-h-9 items-center gap-1 rounded-full border border-amber-400 bg-white px-2.5 text-xs">
              {a.texto} <span aria-hidden>✕</span>
              <span className="sr-only">Quitar este filtro</span>
            </Link>
          ))}
          <span className="flex-1" />
          <Link href={`/comercial/crm${tipo === "renovacion" ? "?p=renovacion" : ""}`} className="inline-flex min-h-11 items-center font-semibold underline">
            Quitar filtro{activos.length > 1 ? "s" : ""}
          </Link>
        </div>
      )}

      <div className="mb-4">
        <PanelFiltrosCrm
          key={JSON.stringify(filtros)}
          filtros={filtros}
          base={base}
          clientes={opcionesCliente}
          responsables={opcionesResponsable}
          conOrigen={conOrigen}
          abierto={filtrando && activos.some((a) => a.clave !== "grupo")}
        />
      </div>

      {filtrando ? (
        <section className="mb-5">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {resultado.length} {resultado.length === 1 ? "negocio" : "negocios"} con este filtro
              {resultado.some((o) => o.valor !== null) && ` · ${formatCOP(resultado.reduce((a, o) => a + (o.valor ?? 0), 0))}`}
            </h2>
            <ExportarCrm filas={resultado} responsables={nombreResponsable} />
          </div>
          {resultado.length === 0 ? (
            <p className="rounded-lg border border-slate-200 bg-white px-3 py-6 text-center text-sm text-slate-600">
              No hay negocios con estos filtros. Quita alguno o crea un negocio nuevo.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
              {resultado.map((o) => {
                const vencido = o.abierta && o.objetivoCierre !== null && o.objetivoCierre < hoy;
                return (
                  <li key={o.id}>
                    <Link href={`/comercial/crm/${o.id}`} className="flex items-start gap-3 px-3 py-2.5 active:bg-slate-50">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-900">
                          {o.nombre} <span className="font-normal text-slate-500">· {o.clienteNombre}</span>
                        </p>
                        <p className="text-xs text-slate-600">
                          {NOMBRE_GRUPO[o.grupo]} · {o.etapaNombre}
                          {o.responsableId && nombreResponsable[o.responsableId] ? ` · ${nombreResponsable[o.responsableId]}` : ""}
                          {o.origen ? ` · ${NOMBRE_ORIGEN[o.origen] ?? o.origen}` : ""}
                        </p>
                        <p className="text-xs text-slate-500">
                          Creado {fecha(o.creado)} · último movimiento {fecha(o.ultimaActividad)}
                          {o.objetivoCierre && (
                            <span className={vencido ? "font-semibold text-red-700" : ""}>
                              {" "}· cierre {vencido ? "vencido el" : "esperado el"} {fecha(o.objetivoCierre)}
                            </span>
                          )}
                        </p>
                      </div>
                      {o.valor !== null && (
                        <span className={`shrink-0 text-xs ${o.valorEsCotizado ? "font-medium text-slate-700" : "text-slate-400"}`}>
                          {o.valorEsCotizado ? "" : "~"}
                          {formatCOP(o.valor)}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ) : (
        <>
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
                    {cotizado > 0 && <p className="text-xs text-slate-700">{formatCOP(cotizado)} cotizado</p>}
                    {estimado > 0 && <p className="text-xs text-slate-400">~{formatCOP(estimado)} estimado</p>}
                  </div>
                  <div className="space-y-2">
                    {deEtapa.map((t) => (
                      <Tarjeta key={t.id} t={t} />
                    ))}
                    {deEtapa.length === 0 && <p className="px-1 py-2 text-xs text-slate-400">—</p>}
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
                      className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
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
        </>
      )}
    </div>
  );
}

/** Cada filtro puesto, en palabras, con lo que hay que dejar para quitarlo. */
function describirFiltros(
  f: FiltrosCrm,
  nombres: { cliente: Record<string, string>; responsable: Record<string, string> },
): { clave: keyof FiltrosCrm; texto: string; vacio: unknown }[] {
  const r: { clave: keyof FiltrosCrm; texto: string; vacio: unknown }[] = [];
  if (f.grupo) r.push({ clave: "grupo", texto: NOMBRE_GRUPO[f.grupo], vacio: null });
  if (f.valorMin !== null) r.push({ clave: "valorMin", texto: `desde ${formatCOP(f.valorMin)}`, vacio: null });
  if (f.valorMax !== null) r.push({ clave: "valorMax", texto: `hasta ${formatCOP(f.valorMax)}`, vacio: null });
  const queFecha = CAMPOS_FECHA.find((c) => c.id === f.campoFecha)?.nombre.toLowerCase();
  if (f.atajo) r.push({ clave: "atajo", texto: `${queFecha}: ${ATAJOS.find((a) => a.id === f.atajo)?.nombre.toLowerCase()}`, vacio: null });
  else {
    if (f.desde) r.push({ clave: "desde", texto: `${queFecha} desde ${fecha(f.desde)}`, vacio: null });
    if (f.hasta) r.push({ clave: "hasta", texto: `${queFecha} hasta ${fecha(f.hasta)}`, vacio: null });
  }
  if (f.cliente) r.push({ clave: "cliente", texto: nombres.cliente[f.cliente] ?? "un cliente", vacio: null });
  if (f.responsable) r.push({ clave: "responsable", texto: nombres.responsable[f.responsable] ?? "un responsable", vacio: null });
  if (f.origen) r.push({ clave: "origen", texto: f.origen === "sin" ? "sin origen" : `origen: ${NOMBRE_ORIGEN[f.origen] ?? f.origen}`, vacio: null });
  if (f.vencidos) r.push({ clave: "vencidos", texto: "vencidos", vacio: false });
  if (f.sinMovimiento) r.push({ clave: "sinMovimiento", texto: `sin movimiento en ${f.sinMovimiento}+ días`, vacio: null });
  return r;
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
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
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
