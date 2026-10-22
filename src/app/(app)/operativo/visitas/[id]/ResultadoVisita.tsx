import Link from "next/link";
import type { VisitaDetalle } from "@/lib/supabase/visita-detalle";
import {
  duracionMs,
  formatoDuracion,
  lineaDeTiempo,
  programadaEn,
  retrasoMs,
  textoRetraso,
  distanciaMetros,
  formatoDistancia,
} from "@/lib/visitas/metricas";
import type { Marcacion } from "@/lib/supabase/visita-detalle";
import { GaleriaFotos } from "./GaleriaFotos";
import { CierreVisita } from "./CierreVisita";
import { AccionesVisita } from "./AccionesVisita";

// Resultado de una visita, dentro de Operativo (los datos los carga page.tsx). Va
// aparte de la carga para poder medirla con datos de prueba.
//
// Lo que se ve al abrir una visita desde la lista de Operativo (referencia:
// docs/operativo-detalle-visita.md). Solo lectura, salvo "Dar por terminada" / "Cerrar". Sin PDF ni correo
// todavía: van después, sobre esta misma pantalla.

const ESTADO: Record<string, string> = {
  programada: "Programada",
  en_curso: "En curso",
  firmada: "Firmada",
  cerrada: "Cerrada",
  cancelada: "Cancelada",
};
const MOMENTO: Record<string, string> = { antes: "Antes", durante: "Durante", despues: "Después" };
const SUGERENCIA: Record<string, string> = {
  pendiente: "Pendiente",
  en_revision: "En revisión",
  cotizada: "Cotizada",
  descartada: "Descartada",
};
const TAREA: Record<string, string> = { por_hacer: "Por hacer", en_progreso: "En progreso", hecho: "Hecho" };

const ZONA = "America/Bogota";
const fechaHora = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat("es-CO", { timeZone: ZONA, day: "2-digit", month: "2-digit", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso))
    : "—";
const hora = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat("es-CO", { timeZone: ZONA, hour: "numeric", minute: "2-digit" }).format(new Date(iso)) : "—";
const fechaLarga = (ymd: string) =>
  new Intl.DateTimeFormat("es-CO", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" }).format(new Date(`${ymd}T00:00:00Z`));

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-3">
      <h2 className="mb-1.5 text-sm font-bold uppercase tracking-wide text-slate-500">{titulo}</h2>
      {children}
    </section>
  );
}

function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2 py-0.5">
      <dt className="w-28 shrink-0 text-slate-500">{etiqueta}</dt>
      <dd className="min-w-0 flex-1 text-slate-900">{children}</dd>
    </div>
  );
}

/**
 * Dónde marcó el técnico. Con la PRECISIÓN siempre a la vista: 40 m de error no es lo mismo que
 * 5, y sin eso se puede acusar a alguien de no haber estado en el sitio por un GPS impreciso.
 * Si la visita tiene la ubicación del sitio, a qué distancia marcó.
 */
function PuntoMarcado({
  etiqueta,
  en,
  m,
  sitio,
}: {
  etiqueta: string;
  en: string | null;
  m: Marcacion | null | undefined;
  sitio: { lat: number; lng: number } | null;
}) {
  if (!en) return null;
  m = m ?? { estado: null, lat: null, lng: null, precisionM: null };
  const punto = m.estado === "concedido" && m.lat !== null && m.lng !== null ? { lat: m.lat, lng: m.lng } : null;
  const distancia = punto && sitio ? distanciaMetros(punto.lat, punto.lng, sitio.lat, sitio.lng) : null;
  const sinPunto: Record<string, string> = {
    sin_senal: "sin señal de GPS: no se registró la ubicación",
    denegado: "el técnico no dio permiso de ubicación: no se registró",
    no_disponible: "el celular no tenía GPS disponible: no se registró",
  };
  return (
    <p className="text-sm text-slate-700">
      <span className="font-semibold">{etiqueta}</span> {hora(en)}
      {punto ? (
        <>
          {distancia !== null && (
            <>
              {" · "}a <span className="font-semibold">{formatoDistancia(distancia)}</span> del sitio
              {m.precisionM !== null && distancia <= m.precisionM ? " (dentro del margen del GPS)" : ""}
            </>
          )}
          {m.precisionM !== null && ` · precisión ±${formatoDistancia(m.precisionM)}`}
          {" · "}
          <a
            href={`https://www.google.com/maps?q=${punto.lat},${punto.lng}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-9 items-center font-semibold text-[#A82323] underline"
          >
            Ver en el mapa
          </a>
        </>
      ) : (
        <span className="text-amber-800"> · {sinPunto[m.estado ?? ""] ?? "sin dato de ubicación"}</span>
      )}
    </p>
  );
}

export function ResultadoVisita({
  v,
  puedeCerrar,
  tecnicos = [],
}: {
  v: VisitaDetalle;
  puedeCerrar: boolean;
  /** Para cambiar el técnico (solo con operativo/trabajar). */
  tecnicos?: { id: string; nombre: string }[];
}) {
  const hitos = lineaDeTiempo(v.creadaEn, v.vistoEn, v.jornadas);
  const duracion = duracionMs(v.jornadas);
  const programada = programadaEn(v.fechaProgramada, v.horaProgramada);
  const retraso = retrasoMs(programada, hitos[2].en);
  const modoCierre =
    puedeCerrar && v.estado === "firmada"
      ? ("cerrar_firmada" as const)
      : puedeCerrar && v.tipo === "obra" && v.estado === "en_curso"
        ? ("terminar_obra" as const)
        : null;
  const mapa = v.sitio ? `https://www.google.com/maps/search/?api=1&query=${v.sitio.lat},${v.sitio.lng}` : null;
  const jornadaPorId = new Map(v.jornadas.map((j) => [j.id, j]));
  const fotos = [...v.fotos]
    .sort((a, b) => (a.tomadaEn ?? "").localeCompare(b.tomadaEn ?? ""))
    .map((f) => {
      const dia = f.jornadaId && v.tipo === "obra" ? jornadaPorId.get(f.jornadaId)?.fecha : null;
      return {
        id: f.id,
        url: f.url,
        enDrive: f.enDrive,
        etiqueta: [f.momento ? MOMENTO[f.momento] : null, dia ? dia.slice(5).split("-").reverse().join("/") : null, hora(f.tomadaEn)]
          .filter(Boolean)
          .join(" · "),
      };
    });

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 space-y-2 p-3 sm:p-4">
      <div className="flex items-center justify-between gap-2">
        <Link href="/operativo" className="flex min-h-11 items-center text-sm text-slate-600">
          ← Operativo
        </Link>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
          {ESTADO[v.estado] ?? v.estado}
          {v.tipo === "obra" ? " · Obra" : ""}
        </span>
      </div>
      <h1 className="text-lg font-bold leading-snug text-slate-900">{v.titulo}</h1>

      {/* ---------------------------------------------------------------- datos */}
      <Seccion titulo="Datos de la visita">
        <dl className="text-sm">
          <Dato etiqueta="Programada">
            {v.fechaProgramada ? fechaLarga(v.fechaProgramada) : "—"}
            {v.horaProgramada ? ` · ${v.horaProgramada.slice(0, 5)}` : ""}
            {v.tipo === "obra" && v.fechaFinEstimada ? ` → ${fechaLarga(v.fechaFinEstimada)}` : ""}
          </Dato>
          <Dato etiqueta="Técnico">{v.tecnico.nombre}</Dato>
          <Dato etiqueta="Creada por">
            {v.creadaPor} · {fechaHora(v.creadaEn)}
          </Dato>
          {v.clienteNombre && <Dato etiqueta="Cliente">{v.clienteNombre}</Dato>}
          {(v.direccion || mapa) && (
            <Dato etiqueta="Dirección">
              {v.direccion ?? "—"}
              {mapa && (
                <>
                  {" · "}
                  <a href={mapa} target="_blank" rel="noreferrer" className="font-semibold text-[#A82323] underline">
                    Ver en el mapa
                  </a>
                </>
              )}
            </Dato>
          )}
          {(v.contactoSitio || v.telefonoSitio) && (
            <Dato etiqueta="Contacto">{[v.contactoSitio, v.telefonoSitio].filter(Boolean).join(" · ")}</Dato>
          )}
          {v.descripcionTrabajo && <Dato etiqueta="Trabajo">{v.descripcionTrabajo}</Dato>}
        </dl>
        {puedeCerrar && (v.estado === "programada" || v.estado === "cancelada" || v.estado === "en_curso") && (
          <div className="mt-2 border-t border-slate-100 pt-2">
            <AccionesVisita visitaId={v.id} titulo={v.titulo} estado={v.estado} tecnicoId={v.tecnico.id} tecnicos={tecnicos} />
          </div>
        )}
      </Seccion>

      {/* ---------------------------------------------------------------- monitoreo */}
      <Seccion titulo="Monitoreo">
        <ol className="grid grid-cols-4 gap-1 text-center">
          {hitos.map((h) => (
            <li key={h.clave} className="flex flex-col items-center">
              <span
                className={`mb-1 h-3 w-3 rounded-full ${h.en ? "bg-[#A82323]" : "border-2 border-slate-300 bg-white"}`}
                aria-hidden
              />
              <span className="text-xs font-semibold text-slate-800">{h.etiqueta}</span>
              <span className="text-xs text-slate-600">
                {h.en
                  ? fechaHora(h.en)
                  : h.clave === "vista" && hitos[2].en
                    ? "no aplica"
                    : "pendiente"}
              </span>
            </li>
          ))}
        </ol>
        {/* Dónde marcó (visita de un día; en una obra va por día en el reporte). */}
        {v.tipo !== "obra" && v.jornadas[0] && (
          <div className="mt-2 space-y-0.5 rounded-md bg-slate-50 p-2">
            <PuntoMarcado etiqueta="Check-in" en={v.jornadas[0].checkInEn} m={v.jornadas[0].checkIn} sitio={v.sitio} />
            <PuntoMarcado
              etiqueta="Check-out"
              en={v.jornadas[v.jornadas.length - 1].checkOutEn}
              m={v.jornadas[v.jornadas.length - 1].checkOut}
              sitio={v.sitio}
            />
          </div>
        )}
        <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-md bg-slate-50 p-2">
            <dt className="text-xs text-slate-500">{v.tipo === "obra" ? "Tiempo en sitio (suma)" : "Duración"}</dt>
            <dd className="font-semibold text-slate-900">{duracion !== null ? formatoDuracion(duracion) : "—"}</dd>
          </div>
          <div className="rounded-md bg-slate-50 p-2">
            <dt className="text-xs text-slate-500">Retraso</dt>
            <dd className={`font-semibold ${retraso !== null && retraso >= 60_000 ? "text-[#A82323]" : "text-slate-900"}`}>
              {retraso !== null ? textoRetraso(retraso) : v.horaProgramada ? "sin entrada todavía" : "sin hora programada"}
            </dd>
          </div>
        </dl>
        {v.tipo === "obra" && v.jornadas.length > 0 && (
          <ul className="mt-2 divide-y divide-slate-100 text-sm">
            {v.jornadas.map((j) => {
              const d = duracionMs([j]);
              return (
                <li key={j.id} className="flex justify-between gap-2 py-1">
                  <span className="first-letter:uppercase">{fechaLarga(j.fecha)}</span>
                  <span className="text-slate-600">
                    {hora(j.checkInEn)} → {j.checkOutEn ? hora(j.checkOutEn) : "sin salida"}
                    {d !== null ? ` · ${formatoDuracion(d)}` : ""}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        {v.cierre && (
          <p className="mt-2 rounded-md bg-slate-100 px-2 py-1 text-sm text-slate-700">
            {v.firmadaEn ? "Cerrada" : "Dada por terminada"} por {v.cierre.por} · {fechaHora(v.cierre.en)}
            {v.cierre.nota ? ` · ${v.cierre.nota}` : ""}
          </p>
        )}
        {modoCierre && (
          <div className="mt-2">
            <CierreVisita visitaId={v.id} modo={modoCierre} />
          </div>
        )}
      </Seccion>

      {/* ---------------------------------------------------------------- firmas */}
      <Seccion titulo="Firmas">
        {v.firmas.length === 0 ? (
          <p className="text-sm text-slate-500">Todavía sin firmas.</p>
        ) : (
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {v.firmas.map((f) => (
              <li key={f.tipo} className="rounded-md border border-slate-200 p-2 text-sm">
                <p className="text-xs font-semibold uppercase text-slate-500">{f.tipo === "tecnico" ? "Técnico" : "Cliente"}</p>
                {f.url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- enlace firmado y temporal del bucket privado
                  <img src={f.url} alt={`Firma de ${f.nombre}`} className="my-1 h-24 w-full rounded bg-white object-contain" />
                ) : (
                  <p className="my-1 text-slate-500">Imagen no disponible</p>
                )}
                <p className="text-slate-900">
                  Firmado por: <span className="font-semibold">{f.nombre}</span>
                </p>
                <p className="text-slate-600">
                  C.C. {f.cedula}
                  {f.cargo ? ` · ${f.cargo}` : ""} · {fechaHora(f.firmadaEn)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Seccion>

      {/* ---------------------------------------------------------------- fotos */}
      <Seccion titulo={`Fotos (${v.fotos.length})`}>
        <GaleriaFotos fotos={fotos} />
      </Seccion>

      {/* ---------------------------------------------------------------- reporte diario */}
      <Seccion titulo={v.tipo === "obra" ? "Reporte diario" : "Reporte"}>
        {v.jornadas.length === 0 ? (
          <p className="text-sm text-slate-500">El técnico todavía no marcó entrada.</p>
        ) : (
          <div className="space-y-2">
            {v.jornadas.map((j) => (
              <div key={j.id} className="rounded-md border border-slate-200 p-2 text-sm">
                <p className="font-semibold first-letter:uppercase text-slate-900">{fechaLarga(j.fecha)}</p>
                <PuntoMarcado etiqueta="Entrada" en={j.checkInEn} m={j.checkIn} sitio={v.sitio} />
                {j.checkOutEn ? (
                  <PuntoMarcado etiqueta="Salida" en={j.checkOutEn} m={j.checkOut} sitio={v.sitio} />
                ) : (
                  <p className="text-sm text-slate-700">
                    <span className="font-semibold">Salida</span> sin marcar
                  </p>
                )}
                {[
                  ["Labor ejecutada", j.laborEjecutada],
                  ["No se hizo", j.noEjecutado],
                  ["Pendiente", j.pendiente],
                  ["Observaciones", j.observaciones],
                ]
                  .filter(([, t]) => t && t.trim())
                  .map(([e, t]) => (
                    <p key={e} className="mt-1 whitespace-pre-line">
                      <span className="font-semibold">{e}: </span>
                      {t}
                    </p>
                  ))}
                {j.fotosAlSalir && <p className="mt-1 text-slate-600">Fotos al salir: {j.fotosAlSalir}</p>}
                {j.motivoFotosIncompletas && (
                  <p className="text-amber-800">Salió sin completar fotos: {j.motivoFotosIncompletas}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </Seccion>

      {/* ---------------------------------------------------------------- sugerencias */}
      <Seccion titulo={`Equipos y materiales sugeridos (${v.sugerencias.length})`}>
        {v.sugerencias.length === 0 ? (
          <p className="text-sm text-slate-500">El técnico no sugirió nada.</p>
        ) : (
          <>
            <ul className="divide-y divide-slate-100 text-sm">
              {v.sugerencias.map((s) => (
                <li key={s.id} className="flex items-start justify-between gap-2 py-1">
                  <span>
                    {s.descripcion}
                    {s.cantidad !== null ? ` · ${s.cantidad} ${s.unidad ?? ""}` : ""}
                    {s.motivo ? <span className="block text-xs text-slate-500">{s.motivo}</span> : null}
                  </span>
                  <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                    {SUGERENCIA[s.estado] ?? s.estado}
                  </span>
                </li>
              ))}
            </ul>
            <Link href="/operativo/sugerencias" className="mt-1 flex min-h-11 items-center text-sm font-semibold text-[#A82323] underline">
              Ir a la bandeja para cotizarlas →
            </Link>
          </>
        )}
      </Seccion>

      {/* ---------------------------------------------------------------- tareas */}
      {v.tareas.length > 0 && (
        <Seccion titulo={`Tareas de esta visita (${v.tareas.length})`}>
          <ul className="divide-y divide-slate-100 text-sm">
            {v.tareas.map((t) => (
              <li key={t.id} className="py-1">
                <p className="flex justify-between gap-2">
                  <span className="text-slate-900">{t.titulo}</span>
                  <span className="shrink-0 text-xs text-slate-600">{TAREA[t.estado] ?? t.estado}</span>
                </p>
                {t.asignados.map((a) => (
                  <p key={a.nombre + a.asignadoEn} className="text-xs text-slate-600">
                    {a.nombre} · asignada {fechaHora(a.asignadoEn)} · {a.vistoEn ? `vista ${fechaHora(a.vistoEn)}` : "todavía no la vio"}
                  </p>
                ))}
              </li>
            ))}
          </ul>
          <Link href="/operativo/tareas" className="mt-1 flex min-h-11 items-center text-sm font-semibold text-[#A82323] underline">
            Reasignar o eliminar tareas en el tablero →
          </Link>
        </Seccion>
      )}

      {/* ---------------------------------------------------------------- notas posteriores */}
      {v.notas.length > 0 && (
        <Seccion titulo="Notas posteriores">
          <ul className="space-y-1 text-sm">
            {v.notas.map((n, i) => (
              <li key={i}>
                <p className="whitespace-pre-line">{n.texto}</p>
                <p className="text-xs text-slate-500">
                  {n.autor ?? "—"} · {fechaHora(n.en)}
                </p>
              </li>
            ))}
          </ul>
        </Seccion>
      )}
    </div>
  );
}
