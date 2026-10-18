"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  deVisita,
  espacioDisponible,
  guardar,
  guardarYEncolar,
  leerMeta,
  guardarMeta,
  pedirAlmacenamientoPersistente,
  todos,
  type EnvioPendiente,
  type FirmaLocal,
  type FotoLocal,
  type JornadaLocal,
  type SugerenciaLocal,
  type Ubicacion,
  type VisitaLocal,
} from "@/lib/tecnico/db";
import { comprimirFoto, ETIQUETA_GPS, hoyBogota, obtenerUbicacion, sha256 } from "@/lib/tecnico/captura";
import { reintentarRechazados, sincronizar } from "@/lib/tecnico/sync";
import {
  contarFotos,
  ETIQUETA_MOMENTO,
  MOMENTOS,
  revisarEvidencia,
  type Momento,
  type RevisionEvidencia,
} from "@/lib/tecnico/evidencia";
import { descargarVisitas, servidorSupabase } from "@/lib/tecnico/servidor-supabase";
import { FirmaPantallaCompleta } from "./FirmaPantallaCompleta";

interface Tecnico {
  id: string;
  nombre: string;
  cedula: string;
}

// Avisos de espacio: con tiempo, no cuando ya no cabe.
const POCAS_FOTOS = 80;
const CASI_SIN_ESPACIO = 20;

const BOTON =
  "min-h-14 w-full rounded-xl px-4 text-lg font-semibold active:scale-[0.99] disabled:opacity-40";
const BOTON_PRIMARIO = `${BOTON} bg-[#A82323] text-white`;
const BOTON_SECUNDARIO = `${BOTON} border-2 border-slate-400 bg-white text-slate-900`;
const CAMPO = "w-full rounded-xl border-2 border-slate-300 bg-white px-3 py-3 text-lg";

function fechaLarga(fecha: string) {
  // Mediodía UTC: la fecha "YYYY-MM-DD" no se corre de día en Colombia.
  return new Date(`${fecha}T12:00:00Z`).toLocaleDateString("es-CO", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "America/Bogota",
  });
}

function sumarDias(fecha: string, dias: number) {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

function hora(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit", timeZone: "America/Bogota" });
}

export function AppTecnico({ tecnico }: { tecnico: Tecnico }) {
  const supabase = useMemo(() => createClient(), []);
  const servidor = useMemo(() => servidorSupabase(supabase), [supabase]);

  const [visitas, setVisitas] = useState<VisitaLocal[]>([]);
  const [abierta, setAbierta] = useState<string | null>(null);
  const [enLinea, setEnLinea] = useState(true);
  const [pendientes, setPendientes] = useState(0);
  const [conErrores, setConErrores] = useState<EnvioPendiente[]>([]);
  const [rechazados, setRechazados] = useState<EnvioPendiente[]>([]);
  const [sincronizando, setSincronizando] = useState(false);
  const [ultimaSync, setUltimaSync] = useState<string | null>(null);
  const [fotosQueCaben, setFotosQueCaben] = useState<number | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const refrescarEstado = useCallback(async () => {
    const cola = await todos<EnvioPendiente>("cola");
    setPendientes(cola.filter((c) => !c.permanente).length);
    setConErrores(cola.filter((c) => c.ultimoError && !c.permanente));
    setRechazados(cola.filter((c) => c.permanente));
    setFotosQueCaben((await espacioDisponible()).fotosQueCaben);
    const vs = await todos<VisitaLocal>("visitas");
    vs.sort((a, b) => (a.fechaProgramada ?? "").localeCompare(b.fechaProgramada ?? ""));
    setVisitas(vs);
  }, []);

  const subir = useCallback(async () => {
    if (!navigator.onLine) return;
    setSincronizando(true);
    try {
      const r = await sincronizar(servidor);
      if (!r.sinConexion) {
        const ahora = new Date().toISOString();
        await guardarMeta("ultimaSync", ahora);
        setUltimaSync(ahora);
        try {
          await descargarVisitas(supabase, tecnico.id);
        } catch {
          // sin red o sesión vencida: se queda con lo que ya tenía
        }
      }
    } finally {
      setSincronizando(false);
      await refrescarEstado();
    }
  }, [servidor, supabase, tecnico.id, refrescarEstado]);

  // Arranque: almacenamiento persistente, service worker, datos locales y primera subida.
  useEffect(() => {
    let vivo = true;
    (async () => {
      setEnLinea(navigator.onLine);
      await pedirAlmacenamientoPersistente();
      setUltimaSync((await leerMeta<string>("ultimaSync")) ?? null);
      if (vivo) await refrescarEstado();
      await subir();
    })();

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .then(() => navigator.serviceWorker.ready)
        .then((reg) => {
          // Los archivos de esta pantalla se bajaron antes del service worker: se guardan.
          const urls = performance
            .getEntriesByType("resource")
            .map((e) => e.name)
            .filter((u) => u.includes("/_next/static/"));
          reg.active?.postMessage({ tipo: "guardar-archivos", urls: [...urls, "/tecnico"] });
        })
        .catch(() => {});
    }

    const alConectar = () => {
      setEnLinea(true);
      subir();
    };
    const alDesconectar = () => setEnLinea(false);
    window.addEventListener("online", alConectar);
    window.addEventListener("offline", alDesconectar);
    // Reintento periódico: el evento "online" no siempre llega al salir de un sótano.
    const cada = window.setInterval(() => subir(), 60_000);
    return () => {
      vivo = false;
      window.removeEventListener("online", alConectar);
      window.removeEventListener("offline", alDesconectar);
      window.clearInterval(cada);
    };
  }, [refrescarEstado, subir]);

  const visita = visitas.find((v) => v.id === abierta) ?? null;

  return (
    <div className="mx-auto w-full max-w-xl pb-24">
      <header className="sticky top-0 z-10 border-b border-slate-300 bg-white px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-lg font-bold">{tecnico.nombre || "Técnico"}</p>
            <p className={`text-sm font-medium ${enLinea ? "text-green-700" : "text-amber-700"}`}>
              {enLinea ? "Con señal" : "Sin señal — todo se guarda en el celular"}
            </p>
          </div>
          <button
            type="button"
            onClick={subir}
            disabled={sincronizando || !enLinea}
            className="min-h-12 shrink-0 rounded-xl border-2 border-slate-400 px-3 text-base font-semibold disabled:opacity-40"
          >
            {sincronizando ? "Subiendo…" : "Sincronizar"}
          </button>
        </div>
        <p className="mt-1 text-sm text-slate-600">
          {pendientes === 0
            ? `Todo subido${ultimaSync ? ` · ${hora(ultimaSync)}` : ""}`
            : `${pendientes} ${pendientes === 1 ? "cosa pendiente" : "cosas pendientes"} de subir`}
        </p>
      </header>

      {fotosQueCaben !== null && fotosQueCaben < POCAS_FOTOS && (
        <p
          className={`mx-4 mt-3 rounded-xl px-4 py-3 text-base font-medium ${
            fotosQueCaben < CASI_SIN_ESPACIO ? "bg-red-100 text-red-900" : "bg-amber-100 text-amber-900"
          }`}
        >
          {fotosQueCaben < CASI_SIN_ESPACIO
            ? `Casi sin espacio: caben unas ${fotosQueCaben} fotos más. Conéctate a una red para subir las pendientes.`
            : `Quedan pocas fotos por caber (unas ${fotosQueCaben}). Cuando tengas red, sincroniza.`}
        </p>
      )}
      {rechazados.length > 0 && (
        <div className="mx-4 mt-3 rounded-xl border-2 border-red-400 bg-red-100 px-4 py-3 text-base text-red-900">
          <p className="font-semibold">
            {rechazados.length === 1 ? "1 registro no se subió" : `${rechazados.length} registros no se subieron`}. No se
            borró nada del celular.
          </p>
          <ul className="mt-1 space-y-1 text-sm">
            {[...new Set(rechazados.map((r) => r.ultimoError))].slice(0, 3).map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
          <button
            type="button"
            onClick={async () => {
              await reintentarRechazados();
              await refrescarEstado();
              subir();
            }}
            disabled={!enLinea || sincronizando}
            className="mt-2 min-h-12 rounded-xl border-2 border-red-700 px-4 text-base font-semibold disabled:opacity-40"
          >
            Ya lo resolvió la oficina: reintentar
          </button>
        </div>
      )}
      {conErrores.length > 0 && (
        <div className="mx-4 mt-3 rounded-xl bg-amber-100 px-4 py-3 text-base text-amber-900">
          <p className="font-semibold">{conErrores.length} sin poder subir todavía — se reintenta solo. No se borró nada.</p>
          <p className="mt-1 text-sm">{conErrores[0].ultimoError}</p>
        </div>
      )}
      {aviso && (
        <p role="status" className="mx-4 mt-3 rounded-xl bg-slate-800 px-4 py-3 text-base text-white">
          {aviso}
        </p>
      )}

      {visita ? (
        <DetalleVisita
          key={visita.id}
          visita={visita}
          tecnico={tecnico}
          fotosQueCaben={fotosQueCaben}
          onVolver={() => setAbierta(null)}
          onCambio={async (mensaje) => {
            setAviso(mensaje ?? null);
            await refrescarEstado();
            subir();
          }}
        />
      ) : (
        <ListaVisitas visitas={visitas} enLinea={enLinea} onAbrir={setAbierta} />
      )}
    </div>
  );
}

function ListaVisitas({
  visitas,
  enLinea,
  onAbrir,
}: {
  visitas: VisitaLocal[];
  enLinea: boolean;
  onAbrir: (id: string) => void;
}) {
  const hoy = hoyBogota();
  if (visitas.length === 0) {
    return (
      <p className="px-4 py-8 text-center text-lg text-slate-600">
        {enLinea
          ? "No tienes visitas asignadas."
          : "Sin señal y sin visitas guardadas en este celular. Ábrela con señal para descargar tus visitas."}
      </p>
    );
  }
  return (
    <ul className="space-y-3 px-4 pt-4">
      {visitas.map((v) => (
        <li key={v.id}>
          <button
            type="button"
            onClick={() => onAbrir(v.id)}
            className="w-full rounded-2xl border-2 border-slate-300 bg-white p-4 text-left active:bg-slate-50"
          >
            <p className="text-sm font-semibold uppercase text-slate-500">
              {v.estado === "en_curso" ? "En curso" : v.estado === "firmada" ? "Firmada" : "Programada"}
              {v.fechaProgramada === hoy ? " · Hoy" : v.fechaProgramada ? ` · ${v.fechaProgramada}` : ""}
              {v.tipo === "obra" ? " · Obra" : ""}
            </p>
            <p className="mt-1 text-xl font-bold leading-snug">{v.titulo}</p>
            {v.clienteNombre && <p className="text-base text-slate-700">{v.clienteNombre}</p>}
            {v.direccion && <p className="text-base text-slate-600">{v.direccion}</p>}
          </button>
        </li>
      ))}
    </ul>
  );
}

function DetalleVisita({
  visita,
  tecnico,
  fotosQueCaben,
  onVolver,
  onCambio,
}: {
  visita: VisitaLocal;
  tecnico: Tecnico;
  fotosQueCaben: number | null;
  onVolver: () => void;
  onCambio: (mensaje?: string) => Promise<void>;
}) {
  const [jornadas, setJornadas] = useState<JornadaLocal[]>([]);
  const [fotos, setFotos] = useState<FotoLocal[]>([]);
  const [sugerencias, setSugerencias] = useState<SugerenciaLocal[]>([]);
  const [firmas, setFirmas] = useState<FirmaLocal[]>([]);
  const [rechazadosVisita, setRechazadosVisita] = useState(0);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const js = await deVisita<JornadaLocal>("jornadas", visita.id);
    js.sort((a, b) => a.fecha.localeCompare(b.fecha));
    setJornadas(js);
    setFotos(await deVisita<FotoLocal>("fotos", visita.id));
    setSugerencias(await deVisita<SugerenciaLocal>("sugerencias", visita.id));
    setFirmas(await deVisita<FirmaLocal>("firmas", visita.id));
    setRechazadosVisita((await deVisita<EnvioPendiente>("cola", visita.id)).filter((c) => c.permanente).length);
  }, [visita.id]);

  useEffect(() => {
    // Lectura de la base local del celular al abrir la visita (sistema externo).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargar();
  }, [cargar]);

  const firmaCliente = firmas.find((f) => f.tipo === "cliente");
  const cerrada = Boolean(firmaCliente) || visita.estado === "firmada";
  const hoy = hoyBogota();
  const jornadaHoy = jornadas.find((j) => j.fecha === hoy) ?? null;

  async function despues(mensaje?: string) {
    await cargar();
    await onCambio(mensaje);
  }

  async function marcarEntrada() {
    setOcupado("Tomando la ubicación…");
    const ubicacion = await obtenerUbicacion();
    const jornada: JornadaLocal = {
      id: crypto.randomUUID(),
      visitaId: visita.id,
      fecha: hoy,
      checkInEn: new Date().toISOString(),
      checkIn: ubicacion,
      checkOutEn: null,
      checkOut: null,
      laborEjecutada: "",
      noEjecutado: "",
      pendiente: "",
      observaciones: "",
    };
    await guardarYEncolar("jornadas", jornada, { id: jornada.id, tipo: "jornada", visitaId: visita.id });
    if (visita.estado === "programada") {
      await guardarYEncolar("visitas", { ...visita, estado: "en_curso", estadoPendiente: true }, {
        id: `estado-${visita.id}`,
        tipo: "estado_visita",
        visitaId: visita.id,
      });
    }
    setOcupado(null);
    await despues(`Entrada ${hora(jornada.checkInEn)} · ${ETIQUETA_GPS[ubicacion.estado]}`);
  }

  async function guardarJornada(j2: JornadaLocal) {
    await guardarYEncolar("jornadas", j2, { id: j2.id, tipo: "jornada", visitaId: visita.id });
    await despues();
  }

  // Salida: si la evidencia del día está incompleta, avisa y pide un motivo. No bloquea.
  const [avisoSalida, setAvisoSalida] = useState<{ jornada: JornadaLocal; revision: RevisionEvidencia } | null>(null);

  function marcarSalida(j: JornadaLocal) {
    const revision = revisarEvidencia(contarFotos(fotos, j.id), visita.fotosMinimasDia ?? null);
    if (revision.completa) {
      hacerSalida(j, revision.resumen, null);
    } else {
      setAvisoSalida({ jornada: j, revision });
    }
  }

  async function hacerSalida(j: JornadaLocal, resumen: string, motivo: string | null) {
    setAvisoSalida(null);
    setOcupado("Tomando la ubicación…");
    const ubicacion = await obtenerUbicacion();
    const actualizada: JornadaLocal = {
      ...j,
      checkOutEn: new Date().toISOString(),
      checkOut: ubicacion,
      fotosAlSalir: resumen,
      motivoFotosIncompletas: motivo,
    };
    await guardarYEncolar("jornadas", actualizada, { id: j.id, tipo: "jornada", visitaId: visita.id });
    setOcupado(null);
    await despues(`Salida ${hora(actualizada.checkOutEn)} · ${ETIQUETA_GPS[ubicacion.estado]} · ${resumen}`);
  }

  return (
    <div className="space-y-4 px-4 pt-4">
      <button type="button" onClick={onVolver} className="min-h-12 text-lg font-semibold text-[#A82323]">
        ← Mis visitas
      </button>

      <section className="rounded-2xl border-2 border-slate-300 bg-white p-4">
        <p className="text-xl font-bold leading-snug">{visita.titulo}</p>
        {visita.clienteNombre && <p className="mt-1 text-lg">{visita.clienteNombre}</p>}
        {visita.direccion && <p className="text-base text-slate-700">{visita.direccion}</p>}
        {(visita.contactoSitio || visita.telefonoSitio) && (
          <p className="mt-1 text-base">
            {visita.contactoSitio}
            {visita.telefonoSitio && (
              <>
                {" · "}
                <a href={`tel:${visita.telefonoSitio}`} className="font-semibold text-[#A82323] underline">
                  {visita.telefonoSitio}
                </a>
              </>
            )}
          </p>
        )}
        {visita.descripcionTrabajo && (
          <p className="mt-3 whitespace-pre-line rounded-xl bg-slate-100 p-3 text-base">{visita.descripcionTrabajo}</p>
        )}
      </section>

      {cerrada && (
        <p className="rounded-xl bg-green-100 px-4 py-3 text-lg font-semibold text-green-900">
          Visita firmada por el cliente. Ya no se edita.
        </p>
      )}

      {ocupado && <p className="rounded-xl bg-slate-800 px-4 py-3 text-lg text-white">{ocupado}</p>}

      {avisoSalida && (
        <AvisoSalida
          revision={avisoSalida.revision}
          onVolver={() => setAvisoSalida(null)}
          onConfirmar={(motivo) => hacerSalida(avisoSalida.jornada, avisoSalida.revision.resumen, motivo)}
        />
      )}

      {visita.tipo === "obra" ? (
        <ReporteDeHoy
          hoy={hoy}
          jornadaHoy={jornadaHoy}
          anterior={[...jornadas].reverse().find((j) => j.fecha < hoy) ?? null}
          cerrada={cerrada}
          ocupado={Boolean(ocupado)}
          onEntrada={marcarEntrada}
          onSalida={marcarSalida}
          onGuardar={guardarJornada}
        />
      ) : (
        <>
          {!cerrada && !jornadaHoy && (
            <button type="button" onClick={marcarEntrada} disabled={Boolean(ocupado)} className={BOTON_PRIMARIO}>
              Marcar entrada (con GPS)
            </button>
          )}
          {jornadas.map((j) => (
            <Jornada
              key={j.id}
              jornada={j}
              esHoy={j.fecha === hoy}
              cerrada={cerrada}
              ocupado={Boolean(ocupado)}
              onSalida={() => marcarSalida(j)}
              onGuardar={guardarJornada}
            />
          ))}
        </>
      )}

      {jornadas.length > 0 && (
        <Fotos
          visitaId={visita.id}
          jornadaId={jornadaHoy?.id ?? jornadas[jornadas.length - 1]?.id ?? null}
          fotos={fotos}
          minimo={visita.fotosMinimasDia ?? null}
          cerrada={cerrada}
          fotosQueCaben={fotosQueCaben}
          onCambio={despues}
        />
      )}

      {jornadas.length > 0 && (
        <Sugerencias
          visitaId={visita.id}
          esObra={visita.tipo === "obra"}
          jornadaId={jornadaHoy?.id ?? null}
          sugerencias={sugerencias}
          cerrada={cerrada}
          onCambio={despues}
        />
      )}

      {visita.tipo === "obra" && (
        <HistorialObra
          jornadas={jornadas.filter((j) => j.fecha !== hoy)}
          cerrada={cerrada}
          onGuardar={guardarJornada}
        />
      )}

      {jornadas.length > 0 && (
        <Firmas
          visita={visita}
          tecnico={tecnico}
          firmas={firmas}
          jornadas={jornadas}
          fotos={fotos}
          sugerencias={sugerencias}
          salidaPendiente={jornadas.some((j) => !j.checkOutEn)}
          rechazados={rechazadosVisita}
          onCambio={despues}
        />
      )}
    </div>
  );
}

function Jornada({
  jornada,
  esHoy,
  cerrada,
  ocupado,
  onSalida,
  onGuardar,
  esObra = false,
}: {
  jornada: JornadaLocal;
  esHoy: boolean;
  cerrada: boolean;
  ocupado: boolean;
  onSalida: () => void;
  onGuardar: (j: JornadaLocal) => Promise<void>;
  esObra?: boolean;
}) {
  const [abierta, setAbierta] = useState(esHoy);
  const [texto, setTexto] = useState({
    laborEjecutada: jornada.laborEjecutada,
    noEjecutado: jornada.noEjecutado,
    pendiente: jornada.pendiente,
    observaciones: jornada.observaciones,
  });
  const [guardado, setGuardado] = useState(true);
  const temporizador = useRef<number | null>(null);
  const editable = !cerrada && !jornada.checkOutEn;

  // Se guarda solo, al dejar de escribir (no depende de un botón que se olvide).
  function cambiar(campo: keyof typeof texto, valor: string) {
    const nuevo = { ...texto, [campo]: valor };
    setTexto(nuevo);
    setGuardado(false);
    if (temporizador.current) window.clearTimeout(temporizador.current);
    temporizador.current = window.setTimeout(async () => {
      await onGuardar({ ...jornada, ...nuevo });
      setGuardado(true);
    }, 800);
  }

  const campos: { clave: keyof typeof texto; etiqueta: string }[] = [
    { clave: "laborEjecutada", etiqueta: esObra ? "Labores realizadas hoy" : "Labor ejecutada" },
    { clave: "noEjecutado", etiqueta: "Lo que no se hizo" },
    { clave: "pendiente", etiqueta: esObra ? "Pendiente para el siguiente día" : "Queda pendiente" },
    { clave: "observaciones", etiqueta: "Observaciones" },
  ];

  return (
    <section className="rounded-2xl border-2 border-slate-300 bg-white p-4">
      <button type="button" onClick={() => setAbierta((a) => !a)} className="w-full text-left">
        <p className="text-lg font-bold first-letter:uppercase">
          {esHoy ? "Hoy" : fechaLarga(jornada.fecha)} {abierta ? "▾" : "▸"}
        </p>
        <p className="text-base text-slate-700">
          Entrada {hora(jornada.checkInEn)} · {jornada.checkIn ? ETIQUETA_GPS[jornada.checkIn.estado] : ""}
        </p>
        {jornada.checkOutEn && (
          <p className="text-base text-slate-700">
            Salida {hora(jornada.checkOutEn)} · {jornada.checkOut ? ETIQUETA_GPS[jornada.checkOut.estado] : ""}
          </p>
        )}
        {jornada.fotosAlSalir && <p className="text-base text-slate-700">Fotos: {jornada.fotosAlSalir}</p>}
        {jornada.motivoFotosIncompletas && (
          <p className="text-base text-amber-800">Salió sin completar fotos: {jornada.motivoFotosIncompletas}</p>
        )}
      </button>

      {abierta && (
        <div className="mt-3 space-y-3">
          {campos.map((c) => (
            <label key={c.clave} className="block">
              <span className="text-base font-semibold">{c.etiqueta}</span>
              <textarea
                rows={3}
                value={texto[c.clave]}
                disabled={!editable}
                onChange={(e) => cambiar(c.clave, e.target.value)}
                className={`${CAMPO} mt-1 disabled:bg-slate-100`}
              />
            </label>
          ))}
          {editable && (
            <p className="text-sm text-slate-500">{guardado ? "Guardado en el celular" : "Guardando…"}</p>
          )}
          {editable && esHoy && (
            <button type="button" onClick={onSalida} disabled={ocupado || !guardado} className={BOTON_SECUNDARIO}>
              Marcar salida (con GPS)
            </button>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * Reporte diario de la obra: lo primero que ve el técnico. Arranca con lo que quedó
 * pendiente el día anterior, para que la bitácora hile la obra y no se escriba en el vacío.
 */
function ReporteDeHoy({
  hoy,
  jornadaHoy,
  anterior,
  cerrada,
  ocupado,
  onEntrada,
  onSalida,
  onGuardar,
}: {
  hoy: string;
  jornadaHoy: JornadaLocal | null;
  anterior: JornadaLocal | null;
  cerrada: boolean;
  ocupado: boolean;
  onEntrada: () => void;
  onSalida: (j: JornadaLocal) => void;
  onGuardar: (j: JornadaLocal) => Promise<void>;
}) {
  return (
    <section className="space-y-3 rounded-2xl border-2 border-[#A82323] bg-white p-4">
      <div>
        <p className="text-sm font-semibold uppercase text-[#A82323]">Reporte diario</p>
        <p className="text-xl font-bold first-letter:uppercase">{fechaLarga(hoy)}</p>
      </div>

      {anterior ? (
        <div className="rounded-xl bg-amber-100 p-3 text-amber-950">
          <p className="text-base font-semibold first-letter:uppercase">Pendiente del {fechaLarga(anterior.fecha)}:</p>
          <p className="whitespace-pre-line text-lg">{anterior.pendiente.trim() || "No dejó pendientes anotados."}</p>
          {anterior.noEjecutado.trim() && (
            <p className="mt-2 whitespace-pre-line text-base">
              <span className="font-semibold">No se alcanzó: </span>
              {anterior.noEjecutado}
            </p>
          )}
        </div>
      ) : (
        <p className="text-base text-slate-600">Primer día de la obra.</p>
      )}

      {!cerrada && !jornadaHoy && (
        <button type="button" onClick={onEntrada} disabled={ocupado} className={BOTON_PRIMARIO}>
          Marcar entrada de hoy (con GPS)
        </button>
      )}
      {jornadaHoy && (
        <Jornada
          jornada={jornadaHoy}
          esHoy
          esObra
          cerrada={cerrada}
          ocupado={ocupado}
          onSalida={() => onSalida(jornadaHoy)}
          onGuardar={onGuardar}
        />
      )}
    </section>
  );
}

/** Días anteriores de la obra: entrada, salida y lo que se hizo. Es el avance real. */
function HistorialObra({
  jornadas,
  cerrada,
  onGuardar,
}: {
  jornadas: JornadaLocal[];
  cerrada: boolean;
  onGuardar: (j: JornadaLocal) => Promise<void>;
}) {
  const [abierta, setAbierta] = useState<string | null>(null);
  const dias = [...jornadas].sort((a, b) => b.fecha.localeCompare(a.fecha));
  return (
    <section className="rounded-2xl border-2 border-slate-300 bg-white p-4">
      <p className="text-lg font-bold">
        Historial de la obra ({dias.length} {dias.length === 1 ? "día" : "días"})
      </p>
      {dias.length === 0 ? (
        <p className="text-base text-slate-600">Todavía no hay días anteriores.</p>
      ) : (
        <ul className="mt-2 divide-y divide-slate-200">
          {dias.map((j) =>
            abierta === j.id ? (
              <li key={j.id} className="py-2">
                <Jornada
                  jornada={j}
                  esHoy={false}
                  esObra
                  cerrada={cerrada}
                  ocupado={false}
                  onSalida={() => {}}
                  onGuardar={onGuardar}
                />
                <button
                  type="button"
                  onClick={() => setAbierta(null)}
                  className="mt-2 min-h-12 text-base font-semibold text-[#A82323]"
                >
                  Cerrar
                </button>
              </li>
            ) : (
              <li key={j.id}>
                <button type="button" onClick={() => setAbierta(j.id)} className="w-full py-3 text-left">
                  <p className="text-base font-bold first-letter:uppercase">{fechaLarga(j.fecha)}</p>
                  <p className="text-sm text-slate-600">
                    Entrada {hora(j.checkInEn) || "—"} · Salida {hora(j.checkOutEn) || "sin marcar"}
                  </p>
                  {j.laborEjecutada.trim() && <p className="line-clamp-2 text-base">{j.laborEjecutada}</p>}
                  {j.pendiente.trim() && (
                    <p className="line-clamp-2 text-sm text-amber-800">Pendiente: {j.pendiente}</p>
                  )}
                </button>
              </li>
            ),
          )}
        </ul>
      )}
    </section>
  );
}

function Fotos({
  visitaId,
  jornadaId,
  fotos,
  minimo,
  cerrada,
  fotosQueCaben,
  onCambio,
}: {
  visitaId: string;
  jornadaId: string | null;
  fotos: FotoLocal[];
  minimo: number | null;
  cerrada: boolean;
  fotosQueCaben: number | null;
  onCambio: (mensaje?: string) => Promise<void>;
}) {
  const camara = useRef<HTMLInputElement>(null);
  const galeria = useRef<HTMLInputElement>(null);
  const [progreso, setProgreso] = useState<string | null>(null);
  const sinEspacio = fotosQueCaben !== null && fotosQueCaben < 3;
  // Recuerda el último momento elegido en esta jornada: se toman diez seguidas del mismo.
  const [momento, setMomento] = useState<Momento>("antes");
  useEffect(() => {
    if (!jornadaId) return;
    leerMeta<Momento>(`momento:${jornadaId}`).then((m) => m && setMomento(m));
  }, [jornadaId]);
  function elegirMomento(m: Momento) {
    setMomento(m);
    if (jornadaId) guardarMeta(`momento:${jornadaId}`, m);
  }

  const delDia = useMemo(() => fotos.filter((f) => f.jornadaId === jornadaId), [fotos, jornadaId]);
  const conteo = contarFotos(fotos, jornadaId);
  const revision = revisarEvidencia(conteo, minimo);
  const otrosDias = fotos.length - delDia.length;
  const subidas = delDia.filter((f) => f.subida).length;

  // Miniaturas: hasta 4 por momento de las que siguen en el celular (memoria de gama media).
  const visibles = useMemo(
    () => MOMENTOS.flatMap((m) => delDia.filter((f) => f.blob && f.momento === m).slice(-4)),
    [delDia],
  );
  const [miniaturas, setMiniaturas] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    const urls = new Map(visibles.map((f) => [f.id, URL.createObjectURL(f.blob as Blob)]));
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMiniaturas(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [visibles]);

  async function procesar(archivos: FileList | null) {
    if (!archivos || archivos.length === 0) return;
    const lista = Array.from(archivos);
    const elegido = momento;
    let hechas = 0;
    let fallidas = 0;
    for (const [i, archivo] of lista.entries()) {
      setProgreso(`Guardando foto ${i + 1} de ${lista.length} (${ETIQUETA_MOMENTO[elegido]})…`);
      try {
        // Una por vez: comprimir y guardar ANTES de tocar la siguiente.
        const blob = await comprimirFoto(archivo);
        const foto: FotoLocal = {
          id: crypto.randomUUID(),
          visitaId,
          jornadaId,
          momento: elegido,
          blob,
          tomadaEn: new Date(archivo.lastModified || Date.now()).toISOString(),
          bytes: blob.size,
          sha256: await sha256(blob),
        };
        await guardarYEncolar("fotos", foto, { id: foto.id, tipo: "foto", visitaId });
        hechas++;
      } catch {
        fallidas++;
      }
    }
    setProgreso(null);
    if (camara.current) camara.current.value = "";
    if (galeria.current) galeria.current.value = "";
    await onCambio(
      fallidas
        ? `${hechas} fotos guardadas; ${fallidas} no se pudieron procesar (¿falta espacio?).`
        : `${hechas} ${hechas === 1 ? "foto guardada" : "fotos guardadas"} (${ETIQUETA_MOMENTO[elegido]}).`,
    );
  }

  return (
    <section className="rounded-2xl border-2 border-slate-300 bg-white p-4">
      <p className="text-lg font-bold">Fotos de hoy</p>
      {/* Contador siempre a la vista: sabe qué le falta sin pensarlo. */}
      <p className={`text-lg font-semibold ${revision.completa ? "text-green-800" : "text-slate-900"}`}>
        {revision.resumen}
      </p>
      {revision.faltanMomentos.length > 0 && (
        <p className="mt-1 rounded-lg bg-red-100 px-3 py-2 text-base font-semibold text-red-900">
          No hay ninguna foto de {revision.faltanMomentos.map((m) => ETIQUETA_MOMENTO[m]).join(", ")}.
        </p>
      )}
      {revision.faltanParaMinimo > 0 && (
        <p className="mt-1 text-base text-amber-800">
          Faltan {revision.faltanParaMinimo} para el mínimo del día ({minimo}).
        </p>
      )}
      <p className="mt-1 text-sm text-slate-600">
        {subidas} subidas · {delDia.length - subidas} esperando señal
        {otrosDias > 0 ? ` · ${otrosDias} de otros días` : ""}
      </p>

      {!cerrada && (
        <>
          <p className="mt-3 text-base font-semibold">Momento de la foto</p>
          <div className="mt-1 grid grid-cols-3 gap-2" role="radiogroup" aria-label="Momento de la foto">
            {MOMENTOS.map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={momento === m}
                onClick={() => elegirMomento(m)}
                className={`min-h-14 rounded-xl border-2 text-lg font-bold ${
                  momento === m ? "border-[#A82323] bg-[#A82323] text-white" : "border-slate-400 bg-white text-slate-900"
                }`}
              >
                {ETIQUETA_MOMENTO[m]}
              </button>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <input ref={camara} type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => procesar(e.target.files)} />
            <input ref={galeria} type="file" accept="image/*" multiple className="sr-only" onChange={(e) => procesar(e.target.files)} />
            <button type="button" onClick={() => camara.current?.click()} disabled={Boolean(progreso) || sinEspacio} className={BOTON_PRIMARIO}>
              Tomar foto
            </button>
            <button type="button" onClick={() => galeria.current?.click()} disabled={Boolean(progreso) || sinEspacio} className={BOTON_SECUNDARIO}>
              De la galería
            </button>
          </div>
        </>
      )}
      {progreso && <p className="mt-3 text-lg font-semibold">{progreso}</p>}

      {/* Agrupadas por momento: así el informe de corte se arma solo. */}
      <div className="mt-4 space-y-3">
        {MOMENTOS.map((m) => {
          const grupo = delDia.filter((f) => f.momento === m);
          const conImagen = grupo.filter((f) => miniaturas.has(f.id));
          return (
            <div key={m}>
              <p className="text-base font-semibold">
                {ETIQUETA_MOMENTO[m]} ({grupo.length})
              </p>
              {conImagen.length > 0 ? (
                <div className="mt-1 grid grid-cols-4 gap-2">
                  {conImagen.map((f) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={f.id} src={miniaturas.get(f.id)} alt="" className="aspect-square w-full rounded-lg object-cover" />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500">{grupo.length ? "Ya subidas." : "Ninguna todavía."}</p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/**
 * Aviso al marcar la salida con evidencia incompleta. NO impide cerrar: pide un motivo
 * escrito y lo deja registrado en la jornada.
 */
function AvisoSalida({
  revision,
  onVolver,
  onConfirmar,
}: {
  revision: RevisionEvidencia;
  onVolver: () => void;
  onConfirmar: (motivo: string) => void;
}) {
  const [motivo, setMotivo] = useState("");
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-slate-900/60 p-3 sm:items-center">
      <div className="w-full max-w-md space-y-3 rounded-2xl bg-white p-5">
        <p className="text-xl font-bold">Faltan fotos de hoy</p>
        <p className="text-lg">{revision.resumen}</p>
        {revision.faltanMomentos.length > 0 && (
          <p className="rounded-lg bg-red-100 px-3 py-2 text-lg font-semibold text-red-900">
            No hay ninguna foto de {revision.faltanMomentos.map((m) => ETIQUETA_MOMENTO[m]).join(", ")}.
          </p>
        )}
        {revision.faltanParaMinimo > 0 && (
          <p className="text-base text-amber-800">Faltan {revision.faltanParaMinimo} para el mínimo del día.</p>
        )}
        <label className="block">
          <span className="text-base font-semibold">¿Por qué sales sin completarlas? *</span>
          <textarea
            rows={3}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ej. el cliente no dejó tomar fotos del cuarto técnico"
            className={`${CAMPO} mt-1`}
          />
        </label>
        <p className="text-sm text-slate-600">Queda registrado en el reporte del día.</p>
        <div className="grid grid-cols-2 gap-3">
          <button type="button" onClick={onVolver} className={BOTON_SECUNDARIO}>
            Tomar fotos
          </button>
          <button type="button" onClick={() => onConfirmar(motivo.trim())} disabled={!motivo.trim()} className={BOTON_PRIMARIO}>
            Salir igual
          </button>
        </div>
      </div>
    </div>
  );
}

function Sugerencias({
  visitaId,
  esObra,
  jornadaId,
  sugerencias,
  cerrada,
  onCambio,
}: {
  visitaId: string;
  esObra: boolean;
  jornadaId: string | null;
  sugerencias: SugerenciaLocal[];
  cerrada: boolean;
  onCambio: (mensaje?: string) => Promise<void>;
}) {
  const [abierto, setAbierto] = useState(false);
  const [descripcion, setDescripcion] = useState("");
  const [cantidad, setCantidad] = useState("");
  const [unidad, setUnidad] = useState("");
  const [motivo, setMotivo] = useState("");
  // En obra: para cuándo hace falta (por defecto, mañana). Sin fecha no se compra a tiempo.
  const [requeridoPara, setRequeridoPara] = useState(() => sumarDias(hoyBogota(), 1));
  const faltaFecha = esObra && !requeridoPara;

  async function agregar() {
    if (!descripcion.trim() || faltaFecha) return;
    const cant = Number(cantidad.replace(",", "."));
    const s: SugerenciaLocal = {
      id: crypto.randomUUID(),
      visitaId,
      jornadaId,
      descripcion: descripcion.trim(),
      cantidad: Number.isFinite(cant) && cant > 0 ? cant : null,
      unidad: unidad.trim(),
      motivo: motivo.trim(),
      requeridoPara: esObra ? requeridoPara : null,
      sugeridaEn: new Date().toISOString(),
    };
    await guardarYEncolar("sugerencias", s, { id: s.id, tipo: "sugerencia", visitaId });
    setDescripcion("");
    setCantidad("");
    setUnidad("");
    setMotivo("");
    setRequeridoPara(sumarDias(hoyBogota(), 1));
    setAbierto(false);
    await onCambio("Sugerencia guardada. El comercial la verá para cotizar.");
  }

  return (
    <section className="rounded-2xl border-2 border-slate-300 bg-white p-4">
      <p className="text-lg font-bold">Equipos y materiales que faltan</p>
      <p className="text-base text-slate-600">Quedan como sugerencia para que el comercial los cotice.</p>
      {sugerencias.length > 0 && (
        <ul className="mt-3 space-y-2">
          {sugerencias.map((s) => (
            <li key={s.id} className="rounded-xl bg-slate-100 p-3 text-base">
              <p className="font-semibold">
                {s.cantidad ?? ""} {s.unidad} {s.descripcion}
              </p>
              {s.requeridoPara && (
                <p className="font-medium text-[#A82323] first-letter:uppercase">Para el {fechaLarga(s.requeridoPara)}</p>
              )}
              {s.motivo && <p className="text-slate-700">{s.motivo}</p>}
            </li>
          ))}
        </ul>
      )}
      {!cerrada &&
        (abierto ? (
          <div className="mt-3 space-y-3">
            <input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Qué falta (ej. cable UTP cat 6)" className={CAMPO} />
            <div className="grid grid-cols-2 gap-3">
              <input value={cantidad} onChange={(e) => setCantidad(e.target.value)} inputMode="decimal" placeholder="Cantidad" className={CAMPO} />
              <input value={unidad} onChange={(e) => setUnidad(e.target.value)} placeholder="Unidad (m, und)" className={CAMPO} />
            </div>
            {esObra && (
              <label className="block">
                <span className="text-base font-semibold">Para cuándo lo necesitas *</span>
                <input
                  type="date"
                  value={requeridoPara}
                  min={hoyBogota()}
                  onChange={(e) => setRequeridoPara(e.target.value)}
                  className={`${CAMPO} mt-1`}
                />
              </label>
            )}
            <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} placeholder="Por qué hace falta" className={CAMPO} />
            <div className="grid grid-cols-2 gap-3">
              <button type="button" onClick={() => setAbierto(false)} className={BOTON_SECUNDARIO}>
                Cancelar
              </button>
              <button type="button" onClick={agregar} disabled={!descripcion.trim() || faltaFecha} className={BOTON_PRIMARIO}>
                Guardar
              </button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setAbierto(true)} className={`${BOTON_SECUNDARIO} mt-3`}>
            + Sugerir equipo o material
          </button>
        ))}
    </section>
  );
}

function Firmas({
  visita,
  tecnico,
  firmas,
  jornadas,
  fotos,
  sugerencias,
  salidaPendiente,
  rechazados,
  onCambio,
}: {
  visita: VisitaLocal;
  tecnico: Tecnico;
  firmas: FirmaLocal[];
  jornadas: JornadaLocal[];
  fotos: FotoLocal[];
  sugerencias: SugerenciaLocal[];
  /** Hay una jornada sin salida: la firma del cliente cierra la visita, así que va después. */
  salidaPendiente: boolean;
  /**
   * Registros de esta visita rechazados de forma permanente. La firma del cliente sube
   * última y solo cuando no queda nada de la visita: con un rechazado, nunca subiría.
   */
  rechazados: number;
  onCambio: (mensaje?: string) => Promise<void>;
}) {
  const firmaTecnico = firmas.find((f) => f.tipo === "tecnico");
  const firmaCliente = firmas.find((f) => f.tipo === "cliente");
  const [paso, setPaso] = useState<null | "datos-tecnico" | "lienzo-tecnico" | "datos-cliente" | "lienzo-cliente">(null);
  // Nombre y cédula del técnico salen de su perfil: lo que se escribe a mano cada día, se escribe mal.
  const [datos, setDatos] = useState({ nombre: tecnico.nombre, cedula: tecnico.cedula, cargo: "" });

  async function guardarFirma(tipo: "tecnico" | "cliente", png: Blob) {
    const ubicacion: Ubicacion = await obtenerUbicacion();
    // Huella de lo registrado al momento de firmar: si después algo cambia, se nota.
    const contenido = JSON.stringify({
      visita: visita.id,
      jornadas: jornadas.map((j) => ({ ...j })),
      fotos: fotos.map((f) => ({ id: f.id, sha256: f.sha256 })),
      sugerencias,
    });
    const firma: FirmaLocal = {
      id: crypto.randomUUID(),
      visitaId: visita.id,
      tipo,
      nombre: datos.nombre.trim(),
      cedula: datos.cedula.trim(),
      cargo: datos.cargo.trim(),
      blob: png,
      firmadaEn: new Date().toISOString(),
      ubicacion,
      hashContenido: await sha256(contenido),
    };
    await guardarYEncolar("firmas", firma, { id: firma.id, tipo: "firma", visitaId: visita.id });
    if (tipo === "cliente") {
      await guardar<VisitaLocal>("visitas", { ...visita, estado: "firmada" });
    }
    setPaso(null);
    await onCambio(tipo === "cliente" ? "Visita firmada. Se sube sola cuando haya señal." : "Firma del técnico guardada.");
  }

  if (paso === "lienzo-tecnico") {
    return <FirmaPantallaCompleta titulo={`Firma del técnico — ${datos.nombre}`} onCancelar={() => setPaso(null)} onListo={(b) => guardarFirma("tecnico", b)} />;
  }
  if (paso === "lienzo-cliente") {
    return <FirmaPantallaCompleta titulo={`Firma del cliente — ${datos.nombre}`} onCancelar={() => setPaso(null)} onListo={(b) => guardarFirma("cliente", b)} />;
  }

  const datosCompletos = datos.nombre.trim() && datos.cedula.trim();

  return (
    <section className="rounded-2xl border-2 border-slate-300 bg-white p-4">
      <p className="text-lg font-bold">Firmas</p>
      <p className="text-base text-slate-700">
        Técnico: {firmaTecnico ? `${firmaTecnico.nombre} · ${hora(firmaTecnico.firmadaEn)}` : "pendiente"}
      </p>
      <p className="text-base text-slate-700">
        Cliente: {firmaCliente ? `${firmaCliente.nombre} · ${hora(firmaCliente.firmadaEn)}` : "pendiente"}
      </p>

      {(paso === "datos-tecnico" || paso === "datos-cliente") && (
        <div className="mt-3 space-y-3">
          <input value={datos.nombre} onChange={(e) => setDatos({ ...datos, nombre: e.target.value })} placeholder="Nombre completo" className={CAMPO} />
          <input value={datos.cedula} onChange={(e) => setDatos({ ...datos, cedula: e.target.value })} inputMode="numeric" placeholder="Cédula" className={CAMPO} />
          {paso === "datos-cliente" && (
            <input value={datos.cargo} onChange={(e) => setDatos({ ...datos, cargo: e.target.value })} placeholder="Cargo (ej. administrador, portería)" className={CAMPO} />
          )}
          {paso === "datos-tecnico" && !tecnico.cedula && (
            <p className="text-sm text-amber-800">Tu perfil no tiene cédula: pídele a la oficina que la cargue.</p>
          )}
          {paso === "datos-cliente" && (
            <p className="text-sm text-slate-600">Al firmar el cliente, la visita se cierra y ya no se puede editar.</p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <button type="button" onClick={() => setPaso(null)} className={BOTON_SECUNDARIO}>
              Cancelar
            </button>
            <button
              type="button"
              disabled={!datosCompletos}
              onClick={() => setPaso(paso === "datos-tecnico" ? "lienzo-tecnico" : "lienzo-cliente")}
              className={BOTON_PRIMARIO}
            >
              Firmar
            </button>
          </div>
        </div>
      )}

      {paso === null && !firmaTecnico && (
        <button
          type="button"
          onClick={() => {
            setDatos({ nombre: tecnico.nombre, cedula: tecnico.cedula, cargo: "" });
            setPaso("datos-tecnico");
          }}
          className={`${BOTON_PRIMARIO} mt-3`}
        >
          Firma del técnico
        </button>
      )}
      {rechazados > 0 && !firmaCliente && (
        <p className="mt-3 rounded-xl border-2 border-red-400 bg-red-100 px-4 py-3 text-base font-medium text-red-900">
          {rechazados === 1 ? "Hay 1 registro" : `Hay ${rechazados} registros`} de esta visita que el servidor no aceptó. Si
          el cliente firma ahora, su firma quedaría solo en este celular y no subiría. Avisa a la oficina antes de pedir la
          firma.
        </p>
      )}
      {rechazados > 0 && firmaCliente && !firmaCliente.subida && (
        <p className="mt-3 rounded-xl border-2 border-red-400 bg-red-100 px-4 py-3 text-base font-medium text-red-900">
          La firma del cliente está guardada en este celular, pero no va a subir hasta que se resuelva{" "}
          {rechazados === 1 ? "1 registro rechazado" : `${rechazados} registros rechazados`}. Avisa a la oficina.
        </p>
      )}
      {paso === null && firmaTecnico && !firmaCliente && salidaPendiente && (
        <p className="mt-3 rounded-xl bg-amber-100 px-4 py-3 text-base font-medium text-amber-900">
          Marca la salida del día antes de la firma del cliente: al firmar, la visita se cierra y ya no se
          puede registrar nada más.
        </p>
      )}
      {paso === null && firmaTecnico && !firmaCliente && (
        <button
          type="button"
          disabled={salidaPendiente || rechazados > 0}
          onClick={() => {
            setDatos({ nombre: "", cedula: "", cargo: "" });
            setPaso("datos-cliente");
          }}
          className={`${BOTON_PRIMARIO} mt-3`}
        >
          Firma del cliente y cerrar
        </button>
      )}
    </section>
  );
}
