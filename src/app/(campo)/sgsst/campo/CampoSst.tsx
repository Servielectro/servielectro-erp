"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { FormularioSst, type ArchivoVista } from "@/components/sst/FormularioSst";
import { FirmaPantallaCompleta } from "@/app/(campo)/tecnico/FirmaPantallaCompleta";
import { comprimirFoto, hoyBogota, obtenerUbicacion, sha256 } from "@/lib/tecnico/captura";
import { dePadre, deVisita, guardar, guardarYEncolar, leer, leerMeta, guardarMeta, todos } from "@/lib/tecnico/db";
import { useCola, nuevoId } from "@/lib/sst/campo";
import { dispositivoActual, type PlantillaLocal, type SstArchivoLocal, type SstFirmaLocal, type SstFormatoLocal } from "@/lib/sst/local";
import { iniciaMismoDia, sumarDiasHabiles } from "@/lib/fechas/dias-habiles";
import { HojaFormato, tieneHojaPropia } from "@/components/sst/papel/HojaFormato";
import {
  AMBITO,
  avisosDeFirma,
  avisosDePersonas,
  diaDeFirma,
  COLUMNAS_PLANTILLA,
  docComparable,
  prellenar,
  faltantes,
  firmasQueFaltan,
  pideTecnicos,
  ROL_LISTA,
  tecnicosSinFirmar,
  type Ambito,
  type ColumnaPersona,
  type FirmaPedida,
  type Plantilla,
  type TecnicoEnObra,
} from "@/lib/sst/plantillas";

const CAMPO = "mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-base disabled:bg-slate-50 disabled:text-slate-800";
type Yo = { id: string; nombre: string; cedula: string };

/**
 * Campos calculados (migraciones 94 y 96): el inicio de labores y la terminación en días hábiles. La base
 * los vuelve a calcular con la misma regla; aquí es para verlos antes de firmar. Sin calendario
 * de festivos en el celular, la terminación queda vacía y la pone la base al sincronizar.
 */
function conCalculados(f: SstFormatoLocal, festivos: Set<string> | null): SstFormatoLocal {
  let r = f.respuestas;
  let cambio = false;
  for (const c of f.plantilla.campos) {
    if (!c.calculado) continue;
    const mismoDia = iniciaMismoDia(r[c.inicio_campo ?? ""]);
    const v =
      c.calculado === "fecha_del_acta"
        ? f.fecha || null
        : c.calculado === "inicio_dias_habiles"
          ? sumarDiasHabiles(f.fecha, 1, mismoDia, festivos)
          : sumarDiasHabiles(f.fecha, Number(String(r[c.plazo_campo ?? ""] ?? "").trim()), mismoDia, festivos);
    if ((r[c.id] ?? null) !== v) {
      r = { ...r };
      if (v) r[c.id] = v;
      else delete r[c.id];
      cambio = true;
    }
  }
  return cambio ? { ...f, respuestas: r } : f;
}

/**
 * Llenar un formato de SG-SST en la obra, con o sin señal. Todo se guarda primero en el celular y
 * sube por la cola del técnico: contenido → fotos → firmas → cierre. La base sella el formato con
 * la primera firma; aquí también se bloquea el contenido en ese momento, para que el celular y la
 * base digan lo mismo.
 */
export function CampoSst({
  yo,
  ambito = "sgsst",
  proyectoInicial = null,
  formatoInicial = null,
}: {
  yo: Yo;
  ambito?: Ambito;
  proyectoInicial?: string | null;
  /** Un acta armada en la oficina (ej. la de una reunión aprobada) que se trae al celular para firmarla. */
  formatoInicial?: string | null;
}) {
  // Migración 85: el mismo llenado sirve a SG-SST y a las actas de Proyectos. Cada ámbito guarda
  // en el celular sus propias plantillas y solo muestra lo suyo.
  const acta = ambito === "proyectos";
  const k = acta ? "actas" : "sst";
  const [obraNueva, setObraNueva] = useState<string>(proyectoInicial ?? "");
  const [plantillas, setPlantillas] = useState<PlantillaLocal[]>([]);
  const [proyectos, setProyectos] = useState<{ id: string; nombre: string }[]>([]);
  const [personal, setPersonal] = useState<string[]>([]);
  const [formatos, setFormatos] = useState<SstFormatoLocal[]>([]);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [eligiendo, setEligiendo] = useState(false);
  const [avisoTraer, setAvisoTraer] = useState<string | null>(null);
  // Actas (migración 94): lo que se prellena por obra y el calendario de festivos.
  const [prellenado, setPrellenado] = useState<Record<string, Record<string, unknown>>>({});
  const [festivos, setFestivos] = useState<string[] | null>(null);

  const recargarLocales = useCallback(async () => {
    const fs = (await todos<SstFormatoLocal>("sst_formatos")).filter((f) => (f.plantilla.ambito ?? "sgsst") === ambito);
    fs.sort((a, b) => b.actualizadoEn.localeCompare(a.actualizadoEn));
    setFormatos(fs);
  }, [ambito]);

  // Con señal: baja las plantillas publicadas, las obras y los nombres del personal.
  const bajar = useCallback(async () => {
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    const hoy = hoyBogota();
    const [p, o, g, pre, fes] = await Promise.all([
      supabase.from("sst_plantillas").select(COLUMNAS_PLANTILLA).eq("estado", "publicada").eq("ambito", ambito).order("codigo"),
      supabase.rpc("fn_proyectos_nombres"),
      supabase.rpc("fn_sst_personal"),
      acta ? supabase.rpc("fn_actas_prellenado") : Promise.resolve({ data: null, error: null }),
      acta
        ? supabase.from("festivos_colombia").select("fecha").gte("fecha", `${Number(hoy.slice(0, 4)) - 1}-01-01`).lte("fecha", `${Number(hoy.slice(0, 4)) + 3}-12-31`)
        : Promise.resolve({ data: null, error: null }),
    ]);
    // Sin la 94 corrida, estos dos fallan y el acta se llena sin prellenado (como antes).
    if (acta && !pre.error && pre.data) {
      const m = Object.fromEntries(((pre.data ?? []) as { proyecto_id: string; datos: Record<string, unknown> }[]).map((x) => [x.proyecto_id, x.datos]));
      await guardarMeta(`${k}_prellenado`, m);
      setPrellenado(m);
    }
    if (acta && !fes.error && fes.data) {
      const fs = ((fes.data ?? []) as { fecha: string }[]).map((x) => x.fecha);
      await guardarMeta(`${k}_festivos`, fs);
      setFestivos(fs);
    }
    if (!p.error) {
      const ps = ((p.data ?? []) as Plantilla[]).map((x) => ({ id: x.id, codigo: x.codigo, nombre: x.nombre, version: x.version, descripcion: x.descripcion, campos: x.campos, firmas: x.firmas, ambito: x.ambito }));
      await guardarMeta(`${k}_plantillas`, ps);
      setPlantillas(ps);
    }
    if (!o.error) {
      const os = ((o.data ?? []) as { id: string; codigo: string; nombre: string; estado: string }[]).map((x) => ({ id: x.id, nombre: `${x.codigo} · ${x.nombre}` }));
      await guardarMeta(`${k}_proyectos`, os);
      setProyectos(os);
    }
    if (!g.error) {
      const ns = ((g.data ?? []) as { nombre: string; estado_laboral: string }[]).filter((x) => x.estado_laboral !== "retirado").map((x) => x.nombre);
      await guardarMeta(`${k}_personal`, ns);
      setPersonal(ns);
    }
  }, [ambito, k, acta]);

  const cola = useCola(AMBITO[ambito].campo, bajar);

  useEffect(() => {
    const t = setTimeout(async () => {
      setPlantillas((await leerMeta<PlantillaLocal[]>(`${k}_plantillas`)) ?? []);
      setProyectos((await leerMeta<{ id: string; nombre: string }[]>(`${k}_proyectos`)) ?? []);
      setPersonal((await leerMeta<string[]>(`${k}_personal`)) ?? []);
      setPrellenado((await leerMeta<Record<string, Record<string, unknown>>>(`${k}_prellenado`)) ?? {});
      setFestivos((await leerMeta<string[]>(`${k}_festivos`)) ?? null);
      await recargarLocales();
      if (formatoInicial) {
        const local = await leer<SstFormatoLocal>("sst_formatos", formatoInicial);
        // La copia de ESTE dispositivo manda solo si tiene algo por subir o ya tiene firmas; si no,
        // se trae la del servidor: pudo seguirse llenando en otro celular o tablet.
        const sinPendientes = local && !local.cerrado
          && (await deVisita<unknown>("cola", formatoInicial)).length === 0
          && (await dePadre<unknown>("sst_firmas", formatoInicial)).length === 0;
        if (local && !(sinPendientes && navigator.onLine)) {
          setAbierto(formatoInicial);
        } else if (local) {
          const r = await traerFormato(formatoInicial, (await leerMeta<{ id: string; nombre: string }[]>(`${k}_proyectos`)) ?? []);
          // Sin poder traerla (sin señal, ya firmada en otro lado), se abre la del dispositivo y se dice.
          setAvisoTraer(r.aviso);
          await recargarLocales();
          setAbierto(formatoInicial);
        } else {
          setAvisoTraer("Trayendo el documento para firmar…");
          const r = await traerFormato(formatoInicial, (await leerMeta<{ id: string; nombre: string }[]>(`${k}_proyectos`)) ?? []);
          setAvisoTraer(r.aviso);
          if (r.ok) {
            await recargarLocales();
            setAbierto(formatoInicial);
          }
        }
      }
    }, 0);
    return () => clearTimeout(t);
  }, [recargarLocales, k, formatoInicial]);

  async function nuevo(p: PlantillaLocal) {
    const ahora = new Date().toISOString();
    // Un acta va con su obra desde el primer momento (la base no la recibe sin obra).
    const obra = acta ? proyectos.find((x) => x.id === obraNueva) : undefined;
    if (acta && !obra) return;
    const base: SstFormatoLocal = {
      id: nuevoId(),
      plantilla: { ...p, ambito },
      proyectoId: obra?.id ?? null,
      proyectoNombre: obra?.nombre ?? null,
      lugar: "",
      fecha: hoyBogota(),
      // Migración 94: lo que la plantilla pide prellenar, desde los datos de la obra.
      respuestas: obra ? prellenar(p.campos, prellenado[obra.id]) : {},
      creadoEn: ahora,
      actualizadoEn: ahora,
      cerrado: false,
    };
    const f = conCalculados(base, festivos ? new Set(festivos) : null);
    await guardarYEncolar("sst_formatos", f, { id: f.id, tipo: "sst_formato", visitaId: f.id });
    setEligiendo(false);
    await recargarLocales();
    setAbierto(f.id);
    void cola.refrescar();
  }

  const pendientesDe = (id: string) => cola.pendientes.filter((c) => c.visitaId === id).length;
  const rechazadosDe = (id: string) => cola.rechazados.filter((c) => c.visitaId === id);

  if (abierto) {
    return (
      <EditorFormato
        key={abierto}
        id={abierto}
        yo={yo}
        ambito={ambito}
        festivos={festivos}
        proyectos={proyectos}
        personal={personal}
        pendientes={pendientesDe(abierto)}
        rechazados={rechazadosDe(abierto)}
        onVolver={async () => {
          setAbierto(null);
          await recargarLocales();
          void cola.subir();
        }}
        onCambio={() => void cola.refrescar()}
      />
    );
  }

  return (
    <div className="mx-auto w-full max-w-xl space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-slate-900">{acta ? "Actas de obra" : "Formatos SG-SST en sitio"}</h1>
        <Link href={acta ? "/proyectos/actas" : "/sgsst"} className="text-sm text-slate-600 underline">
          Oficina
        </Link>
      </div>
      <BarraCola cola={cola} />
      {avisoTraer && <p className="rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-900">{avisoTraer}</p>}

      {eligiendo ? (
        <section className="space-y-2 rounded-lg border border-slate-300 bg-white p-3">
          {acta && (
            <label className="block text-sm font-medium">
              ¿De qué obra?
              <select value={obraNueva} onChange={(e) => setObraNueva(e.target.value)} className={CAMPO}>
                <option value="">— Elige la obra —</option>
                {proyectos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </select>
            </label>
          )}
          <p className="text-sm font-semibold">{acta ? "¿Qué acta vas a llenar?" : "¿Qué formato vas a llenar?"}</p>
          {acta && !obraNueva && plantillas.length > 0 && <p className="text-xs text-slate-500">Primero elige la obra: el acta queda con ella.</p>}
          {plantillas.length === 0 ? (
            <p className="text-sm text-slate-600">
              {cola.enLinea
                ? acta
                  ? "Todavía no hay plantillas de actas publicadas. Se arman en Proyectos → Actas → Plantillas."
                  : "Todavía no hay plantillas publicadas. Las arma la gestión SST."
                : "Sin señal y sin plantillas guardadas en este celular: abre esta pantalla una vez con señal."}
            </p>
          ) : (
            plantillas.map((p) => (
              <button key={p.id} type="button" disabled={acta && !obraNueva} onClick={() => void nuevo(p)} className="flex min-h-14 w-full flex-col justify-center rounded-lg border border-slate-300 px-3 text-left disabled:opacity-40">
                <span className="text-base font-semibold">{p.nombre}</span>
                <span className="text-xs text-slate-500">
                  {p.codigo} · versión {p.version}
                </span>
              </button>
            ))
          )}
          <button type="button" onClick={() => setEligiendo(false)} className="min-h-11 w-full rounded-lg border border-slate-300 text-sm">
            Cancelar
          </button>
        </section>
      ) : (
        <button type="button" onClick={() => setEligiendo(true)} className="min-h-12 w-full rounded-lg bg-slate-900 text-base font-semibold text-white">
          {acta ? "+ Nueva acta" : "+ Llenar un formato"}
        </button>
      )}

      <section>
        <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">En este celular</h2>
        {formatos.length === 0 ? (
          <p className="text-sm text-slate-500">{acta ? "No has llenado actas en este celular." : "No has llenado formatos en este celular."}</p>
        ) : (
          <ul className="space-y-2">
            {formatos.map((f) => {
              const pend = pendientesDe(f.id);
              const rech = rechazadosDe(f.id).length;
              return (
                <li key={f.id}>
                  <button type="button" onClick={() => setAbierto(f.id)} className="block w-full rounded-lg border border-slate-200 bg-white p-3 text-left">
                    <span className="block font-semibold text-slate-900">{f.plantilla.nombre}</span>
                    <span className="block text-sm text-slate-600">
                      {f.fecha} · {f.proyectoNombre ?? (f.lugar || "sin lugar")}
                    </span>
                    <span className={`block text-xs font-semibold ${rech ? "text-red-800" : f.cerrado ? "text-green-800" : "text-amber-800"}`}>
                      {rech ? "Rechazado por la base: ábrelo para ver por qué" : f.cerrado ? (pend ? `Cerrado · ${pend} por subir` : "Cerrado y subido") : pend ? `En llenado · ${pend} por subir` : "En llenado"}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function BarraCola({ cola }: { cola: ReturnType<typeof useCola> }) {
  return (
    <div className={`flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm ${cola.enLinea ? "bg-slate-100 text-slate-700" : "bg-amber-50 text-amber-900"}`}>
      <span>
        {cola.enLinea ? "Con señal" : "Sin señal: todo se guarda en el celular"}
        {cola.pendientes.length > 0 && ` · ${cola.pendientes.length} por subir`}
        {cola.rechazados.length > 0 && ` · ${cola.rechazados.length} rechazados`}
      </span>
      {cola.enLinea && cola.pendientes.length > 0 && (
        <button type="button" disabled={cola.subiendo} onClick={() => void cola.subir()} className="min-h-11 shrink-0 font-semibold underline disabled:opacity-50">
          {cola.subiendo ? "Subiendo…" : "Subir ahora"}
        </button>
      )}
    </div>
  );
}

function EditorFormato({
  id,
  yo,
  ambito,
  festivos,
  proyectos,
  personal,
  pendientes,
  rechazados,
  onVolver,
  onCambio,
}: {
  id: string;
  yo: Yo;
  ambito: Ambito;
  festivos: string[] | null;
  proyectos: { id: string; nombre: string }[];
  personal: string[];
  pendientes: number;
  rechazados: { ultimoError: string | null }[];
  onVolver: () => void;
  onCambio: () => void;
}) {
  const [f, setF] = useState<SstFormatoLocal | null>(null);
  const [archivos, setArchivos] = useState<SstArchivoLocal[]>([]);
  const [firmas, setFirmas] = useState<SstFirmaLocal[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [firmando, setFirmando] = useState<{ tipo: "campo"; campoId: string; etiqueta: string } | { tipo: "cierre"; pedida: FirmaPedida; datos: DatosFirma } | null>(null);
  const [agregando, setAgregando] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [previa, setPrevia] = useState(false);
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null);

  const recargar = useCallback(async () => {
    setF((await leer<SstFormatoLocal>("sst_formatos", id)) ?? null);
    const as = await dePadre<SstArchivoLocal>("sst_archivos", id);
    const fs = await dePadre<SstFirmaLocal>("sst_firmas", id);
    setArchivos(as);
    setFirmas(fs);
    setUrls((prev) => {
      const nuevo: Record<string, string> = { ...prev };
      for (const x of [...as, ...fs]) if (x.blob && !nuevo[x.id]) nuevo[x.id] = URL.createObjectURL(x.blob);
      return nuevo;
    });
  }, [id]);

  useEffect(() => {
    const t = setTimeout(() => void recargar(), 0);
    return () => clearTimeout(t);
  }, [recargar]);

  // Guardado con un respiro (no se encola en cada letra).
  const calendario = useMemo(() => (festivos ? new Set(festivos) : null), [festivos]);
  const persistir = useCallback(
    (cambiado: SstFormatoLocal) => {
      const nuevo = conCalculados(cambiado, calendario);
      setF(nuevo);
      if (espera.current) clearTimeout(espera.current);
      espera.current = setTimeout(async () => {
        await guardarYEncolar("sst_formatos", nuevo, { id: nuevo.id, tipo: "sst_formato", visitaId: nuevo.id });
        onCambio();
      }, 600);
    },
    [onCambio, calendario],
  );

  const porCampo = useMemo(() => {
    const m: Record<string, number> = {};
    for (const a of archivos) m[a.campoId] = (m[a.campoId] ?? 0) + 1;
    return m;
  }, [archivos]);

  if (!f) return <p className="p-4 text-sm text-slate-500">Cargando…</p>;
  const sellado = firmas.length > 0 || f.cerrado;
  const lista = f.tecnicosEnObra ?? [];
  const conTecnicos = f.plantilla.firmas.some((p) => p.rol === "tecnico");
  // Formato de antes de la 83 que ya tenía firmas y no tiene lista: sigue la regla vieja (una firma).
  const legado = sellado && !f.tecnicosEnObra;
  const falta = [
    ...faltantes(f.plantilla.campos, f.respuestas, porCampo),
    ...(!sellado && pideTecnicos(f.plantilla.firmas) && lista.length === 0 ? ["los técnicos que estuvieron en la obra"] : []),
    ...(!sellado && ambito === "proyectos" && !f.proyectoId ? ["la obra"] : []),
  ];
  const sinFirmar = tecnicosSinFirmar(lista, firmas);
  // Migración 112: firma diaria (ATS y alturas 2026). Quién ya firmó HOY.
  const hoy = hoyBogota();
  const firmoHoy = (rol: string, documento?: string) =>
    firmas.some((x) => x.rol === rol && diaDeFirma(x.firmadaEn) === hoy && (documento === undefined || docComparable(x.documento) === docComparable(documento)));
  const pedidaTecnicos = f.plantilla.firmas.find((p) => p.rol === "tecnico");
  const faltanFirmas = lista.length
    ? [...firmasQueFaltan(f.plantilla.firmas.filter((p) => p.rol !== "tecnico"), firmas), ...sinFirmar.map((t) => t.nombre)]
    : firmasQueFaltan(f.plantilla.firmas, firmas);

  function pedirFirma(clave: string) {
    if (f && firmas.length === 0) {
      const sin = [...avisosDeFirma(f.plantilla.campos, f.respuestas), ...avisosDePersonas(f.plantilla.firmas, lista)];
      if (
        sin.length &&
        !window.confirm(
          `Vas a firmar sin marcar como cumplido:\n\n• ${sin.join("\n• ")}\n\nCon la primera firma el documento queda sellado y, en el acta de inicio, empieza a correr el plazo del contrato (y la multa por día de retraso).\n\n¿Firmar de todos modos?`,
        )
      )
        return;
    }
    setAgregando(clave);
  }

  const vistaArchivos: Record<string, ArchivoVista[]> = {};
  for (const a of archivos) (vistaArchivos[a.campoId] ??= []).push({ id: a.id, url: urls[a.id] ?? null, pendiente: !a.subida });

  async function agregarArchivo(campoId: string, blob: Blob, mime: string) {
    if (!f || sellado) return;
    const a: SstArchivoLocal = { id: nuevoId(), formatoId: f.id, campoId, blob, mime, sha256: await sha256(blob), tomadaEn: new Date().toISOString(), ubicacion: await obtenerUbicacion() };
    await guardarYEncolar("sst_archivos", a, { id: a.id, tipo: "sst_archivo", visitaId: f.id });
    await recargar();
    onCambio();
  }

  async function guardarFirmaCierre(pedida: FirmaPedida, datos: DatosFirma, png: Blob) {
    if (!f) return;
    // Lo último escrito tiene que estar en la cola ANTES de la primera firma (sella el contenido).
    if (espera.current) {
      clearTimeout(espera.current);
      espera.current = null;
      await guardarYEncolar("sst_formatos", f, { id: f.id, tipo: "sst_formato", visitaId: f.id });
    }
    const firma: SstFirmaLocal = {
      id: nuevoId(),
      formatoId: f.id,
      rol: pedida.rol,
      nombre: datos.nombre.trim(),
      documento: datos.documento.trim(),
      cargo: datos.cargo.trim(),
      empresa: datos.empresa.trim(),
      blob: png,
      sha256: await sha256(png),
      firmadaEn: new Date().toISOString(),
      ubicacion: await obtenerUbicacion(),
      dispositivo: dispositivoActual(),
    };
    await guardarYEncolar("sst_firmas", firma, { id: firma.id, tipo: "sst_firma", visitaId: f.id });
    setFirmando(null);
    setAgregando(null);
    setAviso(`Firmó ${firma.nombre}.`);
    await recargar();
    onCambio();
  }

  async function cerrar() {
    if (!f || faltanFirmas.length) return;
    const cerrado = { ...f, cerrado: true, actualizadoEn: new Date().toISOString() };
    await guardarYEncolar("sst_formatos", cerrado, { id: `cerrar-${f.id}`, tipo: "sst_cerrar", visitaId: f.id });
    setAviso(`${ambito === "proyectos" ? "Acta cerrada" : "Formato cerrado"}. Sube con la señal; en la oficina queda sellado y por aprobar.`);
    await recargar();
    onCambio();
  }

  if (previa && tieneHojaPropia(f.plantilla.codigo)) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-slate-100">
        <div className="flex items-center justify-between gap-2 border-b border-slate-300 bg-white px-3 py-2">
          <p className="text-sm font-semibold">Vista previa · como el papel</p>
          <button type="button" onClick={() => setPrevia(false)} className="min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-semibold">
            Cerrar
          </button>
        </div>
        <div className="flex-1 overflow-auto p-2">
          <HojaFormato
            d={{
              codigo: f.plantilla.codigo,
              control: null,
              fecha: f.fecha,
              lugar: f.lugar || null,
              proyecto: f.proyectoNombre,
              respuestas: f.respuestas,
              tecnicos: lista,
              firmas: firmas.map((x) => ({ rol: x.rol, nombre: x.nombre, documento: x.documento, cargo: x.cargo || null, url: urls[x.id] ?? null, firmadaEn: x.firmadaEn })),
            }}
          />
        </div>
      </div>
    );
  }

  if (firmando?.tipo === "campo") {
    return (
      <FirmaPantallaCompleta
        titulo={firmando.etiqueta}
        onCancelar={() => setFirmando(null)}
        onListo={async (png) => {
          await agregarArchivo(firmando.campoId, png, "image/png");
          setFirmando(null);
        }}
      />
    );
  }
  if (firmando?.tipo === "cierre") {
    return (
      <FirmaPantallaCompleta
        titulo={`${firmando.pedida.etiqueta} — ${firmando.datos.nombre}`}
        onCancelar={() => setFirmando(null)}
        onListo={(png) => void guardarFirmaCierre(firmando.pedida, firmando.datos, png)}
      />
    );
  }

  return (
    <div className="mx-auto w-full max-w-xl space-y-4 p-4 pb-24">
      <button type="button" onClick={onVolver} className="min-h-11 text-sm text-slate-600 underline">
        {ambito === "proyectos" ? "← Mis actas" : "← Mis formatos"}
      </button>
      <div>
        <h1 className="text-lg font-bold text-slate-900">{f.plantilla.nombre}</h1>
        <p className="text-xs text-slate-500">
          {f.plantilla.codigo} · versión {f.plantilla.version}
          {pendientes > 0 ? ` · ${pendientes} por subir` : " · todo subido"}
        </p>
        {f.plantilla.descripcion && <p className="mt-1 text-sm text-slate-600">{f.plantilla.descripcion}</p>}
        {tieneHojaPropia(f.plantilla.codigo) && (
          <button type="button" onClick={() => setPrevia(true)} className="mt-2 min-h-11 w-full rounded-lg border-2 border-slate-900 text-sm font-semibold">
            👁 Vista previa (como el papel)
          </button>
        )}
      </div>
      {rechazados.length > 0 && (
        <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-900">
          {rechazados.map((r, i) => (
            <p key={i}>{r.ultimoError}</p>
          ))}
        </div>
      )}

      <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-3">
        <label className="block text-sm font-medium">
          Obra
          <select
            disabled={sellado}
            value={f.proyectoId ?? ""}
            onChange={(e) => {
              const p = proyectos.find((x) => x.id === e.target.value);
              persistir({ ...f, proyectoId: p?.id ?? null, proyectoNombre: p?.nombre ?? null, actualizadoEn: new Date().toISOString() });
            }}
            className={CAMPO}
          >
            {ambito === "proyectos" ? <option value="" disabled>— Elige la obra —</option> : <option value="">— Sin obra / otra —</option>}
            {proyectos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium">
          Lugar exacto
          <input disabled={sellado} value={f.lugar} onChange={(e) => persistir({ ...f, lugar: e.target.value, actualizadoEn: new Date().toISOString() })} placeholder="Ej.: Torre 2, cubierta" className={CAMPO} />
        </label>
        <label className="block text-sm font-medium">
          Fecha
          <input disabled={sellado} type="date" value={f.fecha} onChange={(e) => persistir({ ...f, fecha: e.target.value, actualizadoEn: new Date().toISOString() })} className={CAMPO} />
        </label>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-3">
        <FormularioSst
          campos={f.plantilla.campos}
          respuestas={f.respuestas}
          onCambio={(cid, v) => persistir({ ...f, respuestas: { ...f.respuestas, [cid]: v }, actualizadoEn: new Date().toISOString() })}
          archivos={vistaArchivos}
          onFoto={async (cid, archivo) => agregarArchivo(cid, await comprimirFoto(archivo), "image/jpeg")}
          onFirmaCampo={(cid, etiqueta) => setFirmando({ tipo: "campo", campoId: cid, etiqueta })}
          onUbicacion={async (cid) => {
            const u = await obtenerUbicacion();
            persistir({
              ...f,
              respuestas: { ...f.respuestas, [cid]: u.estado === "concedido" ? { lat: u.lat, lng: u.lng, precision: u.precisionM } : { estado: u.estado } },
              actualizadoEn: new Date().toISOString(),
            });
          }}
          bloqueadoPor={sellado ? "Ya hay firmas: el contenido quedó sellado y no se edita. Todos firman lo mismo." : null}
        />
      </section>

      {conTecnicos && !legado && (
        <ListaTecnicos
          lista={lista}
          personal={personal}
          bloqueado={sellado}
          columnas={pedidaTecnicos?.columnas ?? []}
          diaria={!!pedidaTecnicos?.diaria}
          firmados={lista.filter((t) => (pedidaTecnicos?.diaria ? firmoHoy("tecnico", t.documento) : !sinFirmar.includes(t)))}
          onCambio={(nueva) => persistir({ ...f, tecnicosEnObra: nueva, actualizadoEn: new Date().toISOString() })}
        />
      )}

      <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-3">
        <h2 className="text-base font-bold">Firmas</h2>
        {!sellado && falta.length > 0 && (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">Antes de la primera firma falta llenar: {falta.join(", ")}.</p>
        )}
        {!sellado && falta.length === 0 && <p className="text-xs text-slate-500">Al firmar el primero, el contenido queda sellado: revisa que todo esté bien.</p>}
        {f.plantilla.firmas.map((p) => {
          const hechas = firmas.filter((x) => x.rol === p.rol);
          // Técnicos con lista: un botón por cada uno que falta (no se firma a nombre de otro).
          const porLista = p.rol === "tecnico" && lista.length > 0;
          // Firma diaria (112): un bloque de un firmante, una vez por día; la lista, cada uno una vez por día.
          const puedeOtra = !porLista && !f.cerrado && falta.length === 0 && (p.diaria ? !firmoHoy(p.rol) : ROL_LISTA[p.rol] || hechas.length === 0);
          const porFirmar = p.diaria ? lista.filter((t) => !firmoHoy("tecnico", t.documento)) : sinFirmar;
          return (
            <div key={p.rol + p.etiqueta} className="rounded-md border border-slate-200 p-2">
              <p className="text-sm font-semibold">
                {p.etiqueta}
                {p.obligatoria === false && <span className="font-normal text-slate-500"> · opcional</span>}
              </p>
              {hechas.length === 0 && <p className="text-sm text-slate-500">Sin firmar.</p>}
              {hechas.map((h) => (
                <div key={h.id} className="mt-1 flex items-center gap-2 text-sm">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {urls[h.id] ? <img src={urls[h.id]} alt="" className="h-10 w-20 rounded border border-slate-200 bg-white object-contain" /> : <span className="text-xs text-slate-500">✓</span>}
                  <span>
                    {h.nombre} · CC {h.documento}
                    {h.cargo ? ` · ${h.cargo}` : ""}
                    {p.diaria ? ` · ${diaDeFirma(h.firmadaEn)}` : ""}
                    <span className="block text-xs text-slate-500">{h.subida ? "Subida" : "Por subir"}</span>
                  </span>
                </div>
              ))}
              {porLista &&
                !f.cerrado &&
                falta.length === 0 &&
                porFirmar.map((t) =>
                  agregando === `tec:${docComparable(t.documento)}` ? (
                    <FormDatosFirma
                      key={t.documento}
                      pedida={p}
                      yo={yo}
                      personal={personal}
                      fijo={t}
                      onCancelar={() => setAgregando(null)}
                      onListo={(datos) => setFirmando({ tipo: "cierre", pedida: p, datos })}
                    />
                  ) : (
                    <button
                      key={t.documento}
                      type="button"
                      onClick={() => pedirFirma(`tec:${docComparable(t.documento)}`)}
                      className="mt-2 flex min-h-11 w-full items-center justify-center rounded-lg border-2 border-slate-400 text-sm font-semibold"
                    >
                      ✍ {p.diaria ? "Firma de hoy:" : "Firma"} {t.nombre}
                    </button>
                  ),
                )}
              {agregando === p.rol + p.etiqueta ? (
                <FormDatosFirma
                  pedida={p}
                  yo={yo}
                  personal={personal}
                  onCancelar={() => setAgregando(null)}
                  onListo={(datos) => setFirmando({ tipo: "cierre", pedida: p, datos })}
                />
              ) : (
                puedeOtra && (
                  <button type="button" onClick={() => pedirFirma(p.rol + p.etiqueta)} className="mt-2 flex min-h-11 w-full items-center justify-center rounded-lg border-2 border-slate-400 text-sm font-semibold">
                    ✍ {p.diaria ? (hechas.length ? "Firmar hoy" : "Firmar") : hechas.length && ROL_LISTA[p.rol] ? "Firma otro técnico" : "Firmar"}
                  </button>
                )
              )}
            </div>
          );
        })}
        {f.cerrado ? (
          <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-900">Cerrado en este celular{pendientes ? `: falta subir ${pendientes}.` : " y subido."}</p>
        ) : (
          <>
            <button type="button" disabled={faltanFirmas.length > 0} onClick={() => void cerrar()} className="min-h-12 w-full rounded-lg bg-green-700 text-base font-semibold text-white disabled:opacity-40">
              {ambito === "proyectos" ? "Cerrar acta" : "Cerrar formato"}
            </button>
            {faltanFirmas.length > 0 && <p className="text-center text-sm text-slate-600">Para cerrarlo faltan las firmas de: {faltanFirmas.join(", ")}.</p>}
          </>
        )}
        {aviso && <p className="text-sm text-green-800">{aviso}</p>}
      </section>
    </div>
  );
}

interface DatosFirma {
  nombre: string;
  documento: string;
  cargo: string;
  empresa: string;
}

function FormDatosFirma({
  pedida,
  yo,
  personal,
  fijo,
  onCancelar,
  onListo,
}: {
  pedida: FirmaPedida;
  yo: Yo;
  personal: string[];
  /** Técnico de la lista: nombre y cédula ya anotados (no se cambian al firmar). */
  fijo?: TecnicoEnObra;
  onCancelar: () => void;
  onListo: (d: DatosFirma) => void;
}) {
  const esCliente = pedida.rol === "sst_cliente";
  const [d, setD] = useState<DatosFirma>({
    nombre: fijo?.nombre ?? (pedida.rol === "responsable_sst" ? yo.nombre : ""),
    documento: fijo?.documento ?? (pedida.rol === "responsable_sst" ? yo.cedula : ""),
    cargo: "",
    empresa: esCliente ? "" : "Servielectro SAS",
  });
  const falta = !d.nombre.trim() ? "Escribe el nombre de quien firma." : !d.cargo.trim() ? "Escribe su cargo." : !d.documento.trim() ? "Escribe su número de cédula." : esCliente && !d.empresa.trim() ? "Escribe la empresa del cliente." : null;
  const lista = `personal-${pedida.rol}`;
  return (
    <div className="mt-2 space-y-2 rounded-md bg-slate-50 p-2">
      <label className="block text-sm">
        Nombre completo
        <input disabled={!!fijo} value={d.nombre} onChange={(e) => setD({ ...d, nombre: e.target.value })} list={pedida.rol === "tecnico" ? lista : undefined} className={CAMPO} />
        {pedida.rol === "tecnico" && (
          <datalist id={lista}>
            {personal.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
        )}
      </label>
      <label className="block text-sm">
        Cargo
        <input value={d.cargo} onChange={(e) => setD({ ...d, cargo: e.target.value })} className={CAMPO} />
      </label>
      <label className="block text-sm">
        Cédula
        <input disabled={!!fijo} value={d.documento} onChange={(e) => setD({ ...d, documento: e.target.value })} inputMode="numeric" className={CAMPO} />
      </label>
      {fijo && <p className="text-xs text-slate-500">Nombre y cédula vienen de la lista de técnicos en obra.</p>}
      <label className="block text-sm">
        Empresa
        <input value={d.empresa} onChange={(e) => setD({ ...d, empresa: e.target.value })} className={CAMPO} />
      </label>
      <div className="flex gap-2">
        <button type="button" onClick={onCancelar} className="min-h-11 flex-1 rounded-lg border border-slate-300 text-sm">
          Cancelar
        </button>
        <button type="button" disabled={!!falta} onClick={() => onListo(d)} className="min-h-11 flex-1 rounded-lg bg-slate-900 text-sm font-semibold text-white disabled:opacity-40">
          Pasar a firmar
        </button>
      </div>
      {falta && <p className="text-xs text-slate-500">{falta}</p>}
    </div>
  );
}

/** Quién estuvo en la obra ese día: se anota antes de la primera firma y firman todos. */
function ListaTecnicos({
  lista,
  personal,
  bloqueado,
  columnas,
  diaria,
  firmados,
  onCambio,
}: {
  lista: TecnicoEnObra[];
  personal: string[];
  bloqueado: boolean;
  /** Migración 112: datos por persona (FOR-15: examen, seguridad social, autodeclaración…). */
  columnas: ColumnaPersona[];
  /** Migración 112: firman cada día; "firmó" es "firmó hoy". */
  diaria: boolean;
  firmados: TecnicoEnObra[];
  onCambio: (l: TecnicoEnObra[]) => void;
}) {
  const [nombre, setNombre] = useState("");
  const [doc, setDoc] = useState("");
  const falta = !nombre.trim()
    ? "Para agregar, escribe el nombre."
    : !docComparable(doc)
      ? "Para agregar, escribe la cédula."
      : lista.some((t) => docComparable(t.documento) === docComparable(doc))
        ? "Esa cédula ya está en la lista."
        : null;
  return (
    <section className="space-y-2 rounded-lg border border-slate-200 bg-white p-3">
      <h2 className="text-base font-bold">Técnicos que estuvieron en la obra</h2>
      <p className="text-xs text-slate-500">
        Firman todos los de esta lista: el formato no se cierra hasta que firme cada uno. Se anota antes de la primera firma; después queda sellada.
      </p>
      {lista.length === 0 ? (
        <p className="text-sm text-slate-500">Nadie anotado todavía.</p>
      ) : (
        <ul className="divide-y divide-slate-100 text-sm">
          {lista.map((t) => {
            const firmo = firmados.includes(t);
            return (
              <li key={t.documento} className="flex min-h-11 items-center gap-2 py-1">
                <span className="flex-1">
                  {t.nombre} · CC {t.documento}
                  <span className={`block text-xs ${firmo ? "text-green-700" : "text-slate-500"}`}>
                    {firmo ? (diaria ? "✓ Firmó hoy" : "✓ Firmó") : diaria ? "Falta su firma de hoy" : "Falta su firma"}
                  </span>
                  {columnas.map((c) => {
                    const v = t[c.id];
                    const raro = c.esperado !== undefined && typeof v === "boolean" && v !== c.esperado;
                    return (
                      <span key={c.id} className="mt-1 block">
                        <span className={`block text-xs ${raro ? "font-semibold text-red-800" : "text-slate-600"}`}>{c.etiqueta}</span>
                        <span className="mt-0.5 flex gap-2">
                          {([true, false] as const).map((valor) => (
                            <button
                              key={String(valor)}
                              type="button"
                              disabled={bloqueado}
                              aria-pressed={v === valor}
                              onClick={() => onCambio(lista.map((x) => (x === t ? { ...x, [c.id]: v === valor ? null : valor } : x)))}
                              className={`min-h-11 flex-1 rounded-lg border-2 text-sm font-semibold ${v === valor ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 text-slate-700"} disabled:opacity-80`}
                            >
                              {valor ? "Sí" : "No"}
                            </button>
                          ))}
                        </span>
                      </span>
                    );
                  })}
                </span>
                {!bloqueado && (
                  <button
                    type="button"
                    aria-label={`Quitar a ${t.nombre}`}
                    onClick={() => onCambio(lista.filter((x) => x !== t))}
                    className="min-h-11 min-w-11 rounded-lg border border-slate-300 text-sm"
                  >
                    ✕
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {bloqueado ? (
        <p className="text-xs text-slate-500">La lista quedó sellada con la primera firma.</p>
      ) : (
        <div className="space-y-2 rounded-md bg-slate-50 p-2">
          <label className="block text-sm">
            Nombre completo
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} list="personal-obra" className={CAMPO} />
            <datalist id="personal-obra">
              {personal.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </label>
          <label className="block text-sm">
            Cédula
            <input value={doc} onChange={(e) => setDoc(e.target.value)} inputMode="numeric" className={CAMPO} />
          </label>
          <button
            type="button"
            disabled={!!falta}
            onClick={() => {
              onCambio([...lista, { nombre: nombre.trim(), documento: doc.trim() }]);
              setNombre("");
              setDoc("");
            }}
            className="min-h-11 w-full rounded-lg bg-slate-900 text-sm font-semibold text-white disabled:opacity-40"
          >
            Agregar a la lista
          </button>
          {falta && <p className="text-xs text-slate-500">{falta}</p>}
        </div>
      )}
    </section>
  );
}

/**
 * Trae al celular un documento armado en la oficina (ej. el acta de una reunión aprobada), sin
 * firmas todavía, para firmarlo aquí. Ya existe en la base con este contenido: se guarda local sin
 * volver a subirlo.
 */
async function traerFormato(id: string, proyectos: { id: string; nombre: string }[]): Promise<{ ok: boolean; aviso: string | null }> {
  try {
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    const { data: f } = await supabase.from("sst_formatos").select("id, plantilla_id, proyecto_id, lugar, fecha, respuestas, tecnicos_en_obra, estado").eq("id", id).maybeSingle();
    if (!f) return { ok: false, aviso: "No se encontró el documento (o no tienes permiso para verlo)." };
    if (f.estado !== "borrador") return { ok: false, aviso: "Ese documento ya está cerrado: no recibe más firmas." };
    const [{ data: p }, { count }] = await Promise.all([
      supabase.from("sst_plantillas").select(COLUMNAS_PLANTILLA).eq("id", f.plantilla_id).single(),
      supabase.from("sst_formato_firmas").select("id", { count: "exact", head: true }).eq("formato_id", id),
    ]);
    if (!p) return { ok: false, aviso: "No se pudo leer la plantilla del documento." };
    if (count) return { ok: false, aviso: "Ese documento ya tiene firmas recogidas en otro celular: termina de firmarlo allá." };
    const pl = p as Plantilla;
    const ahora = new Date().toISOString();
    const local: SstFormatoLocal = {
      id: f.id,
      plantilla: { id: pl.id, codigo: pl.codigo, nombre: pl.nombre, version: pl.version, descripcion: pl.descripcion, campos: pl.campos, firmas: pl.firmas, ambito: pl.ambito },
      proyectoId: f.proyecto_id,
      proyectoNombre: proyectos.find((x) => x.id === f.proyecto_id)?.nombre ?? null,
      lugar: f.lugar ?? "",
      fecha: f.fecha,
      respuestas: (f.respuestas ?? {}) as Record<string, unknown>,
      ...(f.tecnicos_en_obra ? { tecnicosEnObra: f.tecnicos_en_obra } : {}),
      creadoEn: ahora,
      actualizadoEn: ahora,
      cerrado: false,
    };
    await guardar("sst_formatos", local);
    return { ok: true, aviso: null };
  } catch {
    return { ok: false, aviso: "Sin señal: para traer el documento hace falta conexión una vez." };
  }
}
