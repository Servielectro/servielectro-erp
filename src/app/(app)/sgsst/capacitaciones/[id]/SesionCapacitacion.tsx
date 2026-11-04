"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { FormularioSst } from "@/components/sst/FormularioSst";
import { FirmaPantallaCompleta } from "@/app/(campo)/tecnico/FirmaPantallaCompleta";
import { obtenerUbicacion, sha256 } from "@/lib/tecnico/captura";
import type { Ubicacion } from "@/lib/tecnico/db";
import { dispositivoActual } from "@/lib/sst/local";
import { docComparable, ESTADO_FORMATO, faltantes, sinOcultos, type Campo } from "@/lib/sst/plantillas";
import type { Asistente } from "@/lib/sst/capacitaciones";
import { VisorPdf } from "@/components/sst/VisorPdf";
import { cerrarAlSalir, duracion, lecturasDe, materialesSinLeer, urlFirmada, type Lectura, type Material } from "@/lib/sst/materiales";

interface Firma {
  id: string;
  rol: string;
  nombre: string;
  documento: string;
  cargo: string | null;
  firmada_en_dispositivo?: string;
  recibida_en?: string;
}

/** El estándar 1.2.2 del plan del año de la sesión (sst_plan_items, migración 108). */
interface ItemPlan {
  id: string;
  codigo: string;
  estandar: string;
  valor: number | null;
}
interface Evidencia {
  id: string;
  descripcion: string;
  path: string | null;
  subida_en: string;
}

type Rol = "tecnico" | "responsable_sst";
interface Datos {
  rol: Rol;
  nombre: string;
  documento: string;
  cargo: string;
}

const CAMPO = "mt-1 block w-full rounded-lg border border-slate-300 px-3 py-3 text-lg";
const BOTON_GRANDE = "flex min-h-16 w-full items-center justify-center rounded-2xl px-4 text-xl font-bold";

interface Leyendo {
  material: Material;
  lecturaId: string;
  url: string;
  token: string;
  quien: Datos;
}

/**
 * Sesión FOR-02. La base (migraciones 83 y 112) exige que la lista de asistentes esté antes de
 * la primera firma y que cada participante que firme esté en ella; con la primera firma la lista
 * y el encabezado quedan sellados. Por eso: 1) se arma la lista, 2) el celular pasa de mano en
 * mano y cada uno toca su nombre, LEE el material (la base anota cuánto lo tuvo abierto) y firma,
 * 3) firma el capacitador, 4) se cierra y sella.
 */
export function SesionCapacitacion({
  id,
  fecha,
  lugar,
  campos,
  respuestas: respuestasIniciales,
  estadoInicial,
  asistentesIniciales,
  firmasIniciales,
  puedeTrabajar,
  materiales,
  materialesSinPublicar,
  lecturasIniciales,
  gestiona,
  yo,
  itemPlan,
  evidenciasIniciales,
}: {
  id: string;
  fecha: string;
  lugar: string | null;
  campos: Campo[];
  respuestas: Record<string, unknown>;
  estadoInicial: string;
  asistentesIniciales: Asistente[];
  firmasIniciales: Firma[];
  puedeTrabajar: boolean;
  materiales: Material[];
  materialesSinPublicar: string[];
  lecturasIniciales: Lectura[];
  /** Nivel "responsable" en la sección: encabezado, lista, capacitador, sellar, panel y evidencias. */
  gestiona: boolean;
  /**
   * Cédula del perfil, solo para PRELLENAR la casilla (puede no haber: los técnicos no están
   * enlazados a empleados ni tienen cédula en el sistema). Con "trabajar" la persona escribe su
   * cédula y se busca en la lista de asistentes; no se le muestra la lista para tocar nombres.
   */
  yo: { nombre: string; documento: string } | null;
  itemPlan: ItemPlan | null;
  evidenciasIniciales: Evidencia[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const [estado, setEstado] = useState(estadoInicial);
  const [asistentes, setAsistentes] = useState(asistentesIniciales);
  const [firmas, setFirmas] = useState(firmasIniciales);
  const [eligiendo, setEligiendo] = useState(false);
  const [datos, setDatos] = useState<Datos | null>(null);
  const [firmando, setFirmando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [verEncabezado, setVerEncabezado] = useState(false);
  const [respuestas, setRespuestas] = useState(respuestasIniciales);
  const [borradorEncabezado, setBorradorEncabezado] = useState(respuestasIniciales);
  const ubicacion = useRef<Promise<Ubicacion> | null>(null);
  const [lecturas, setLecturas] = useState(lecturasIniciales);
  const [leyendo, setLeyendo] = useState<Leyendo | null>(null);
  // Material que se pidió abrir desde el bloque general: se abre al tocar el nombre de quien lee.
  const [porAbrir, setPorAbrir] = useState<Material | null>(null);
  const [evidencias, setEvidencias] = useState(evidenciasIniciales);

  // Si la página se va con el material abierto (bloqueo, pestaña cerrada), la lectura se cierra igual.
  useEffect(() => {
    if (!leyendo) return;
    const alSalir = () => cerrarAlSalir(leyendo.lecturaId, leyendo.token);
    window.addEventListener("pagehide", alSalir);
    return () => window.removeEventListener("pagehide", alSalir);
  }, [leyendo]);

  const abierto = estado === "borrador";
  const participantes = firmas.filter((f) => f.rol === "tecnico");
  const capacitador = firmas.find((f) => f.rol === "responsable_sst");
  const yaFirmaron = new Set(participantes.map((f) => docComparable(f.documento)));
  const pendientes = asistentes.filter((a) => !yaFirmaron.has(docComparable(a.documento)));
  // Quién puede tocar su nombre en este celular: la gestión pasa el celular a todos; un técnico
  // desde su cuenta, solo él (si su cédula está en la lista y no ha firmado).
  const [miCedula, setMiCedula] = useState(yo?.documento ?? "");

  // Con "trabajar": la cédula escrita a mano tiene que estar en la lista y sin firma.
  function seguirConCedula() {
    setError(null);
    const d = docComparable(miCedula);
    if (!d) return setError("Escriba su cédula.");
    const a = asistentes.find((x) => docComparable(x.documento) === d);
    if (!a) return setError("Esa cédula no está en la lista de asistentes de esta capacitación. Pídale a la responsable SG-SST que la revise.");
    if (yaFirmaron.has(d)) return setError("Esa cédula ya firmó esta capacitación.");
    empezar({ rol: "tecnico", nombre: a.nombre, documento: a.documento, cargo: a.cargo ?? "" });
  }
  const listaSellada = firmas.length > 0;
  // La base no deja firmar con un obligatorio del encabezado vacío (p. ej. una sesión creada por SQL).
  const faltaEncabezado = faltantes(campos, respuestas, {});

  async function guardarEncabezado() {
    setError(null);
    const falta = faltantes(campos, borradorEncabezado, {});
    if (falta.length) return setError(`Falta: ${falta.join(", ")}.`);
    setGuardando(true);
    const limpias = sinOcultos(campos, borradorEncabezado);
    const { error } = await supabase.from("sst_formatos").update({ respuestas: limpias }).eq("id", id);
    setGuardando(false);
    if (error) return setError(error.message);
    setRespuestas(limpias);
    setAviso("Encabezado completo.");
  }

  async function recargarFirmas() {
    const { data } = await supabase.from("sst_formato_firmas").select("id, rol, nombre, documento, cargo, firmada_en_dispositivo, recibida_en").eq("formato_id", id).order("recibida_en");
    if (data) setFirmas(data as Firma[]);
  }

  function empezar(d: Datos) {
    setError(null);
    setAviso(null);
    setEligiendo(false);
    setDatos(d);
    if (porAbrir) {
      setPorAbrir(null);
      void abrirMaterial(porAbrir, d);
    }
  }

  // Abrir el material para una persona: la base anota la hora de apertura (fn_sst_material_abrir).
  async function abrirMaterial(m: Material, quien: Datos) {
    setError(null);
    setAviso(null);
    setGuardando(true);
    try {
      const { data: sesion } = await supabase.auth.getSession();
      const token = sesion.session?.access_token;
      if (!token) throw new Error("La sesión se cerró: vuelva a entrar.");
      const url = await urlFirmada(supabase, m.path);
      const { data: lecturaId, error } = await supabase.rpc("fn_sst_material_abrir", {
        p_material: m.id,
        p_formato: id,
        p_persona: quien.nombre.trim(),
        p_documento: quien.documento.trim(),
        p_dispositivo: dispositivoActual() || null,
      });
      if (error) throw new Error(error.message);
      const nueva: Lectura = { id: lecturaId as string, material_id: m.id, persona: quien.nombre.trim(), documento: quien.documento.trim(), abierto_en: new Date().toISOString(), cerrado_en: null, segundos: null };
      setLecturas((ls) => [...ls, nueva]);
      setLeyendo({ material: m, lecturaId: nueva.id, url, token, quien });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  }

  // "Terminé de leer": la base cierra y cuenta los segundos (fn_sst_material_cerrar).
  async function cerrarMaterial() {
    if (!leyendo) return;
    const l = leyendo;
    setLeyendo(null);
    const { data: segundos, error } = await supabase.rpc("fn_sst_material_cerrar", { p_lectura: l.lecturaId });
    if (error) return setError(`No se pudo registrar el cierre de la lectura: ${error.message}`);
    const seg = (segundos as number | null) ?? 0;
    setLecturas((ls) => ls.map((x) => (x.id === l.lecturaId ? { ...x, cerrado_en: new Date().toISOString(), segundos: seg } : x)));
    setAviso(`✓ ${l.quien.nombre.trim()} leyó «${l.material.nombre}» (${duracion(seg)}).`);
  }

  function aFirmar() {
    if (!datos) return;
    if (!datos.nombre.trim() || !docComparable(datos.documento)) return setError("Escriba nombre y cédula.");
    if (datos.rol === "tecnico" && materialesSinLeer(materiales, lecturas, datos.documento).length) return setError("Primero lea el material de la capacitación.");
    setError(null);
    // El GPS puede tardar en interiores: se pide mientras la persona firma.
    ubicacion.current = obtenerUbicacion();
    setFirmando(true);
  }

  async function guardarFirma(png: Blob) {
    if (!datos) return;
    setFirmando(false);
    setGuardando(true);
    setError(null);
    try {
      const firmaId = crypto.randomUUID();
      const ruta = `formatos/${id}/firma-${firmaId}.png`;
      const firmadaEn = new Date().toISOString();
      const [huella, gps] = await Promise.all([sha256(png), ubicacion.current ?? obtenerUbicacion()]);
      const subida = await supabase.storage.from("sgsst").upload(ruta, png, { contentType: "image/png", upsert: false });
      if (subida.error) throw new Error(`No se pudo subir la firma: ${subida.error.message}`);
      const { error } = await supabase.from("sst_formato_firmas").insert({
        id: firmaId,
        formato_id: id,
        rol: datos.rol,
        nombre: datos.nombre.trim(),
        documento: datos.documento.trim(),
        cargo: datos.cargo.trim() || null,
        imagen_path: ruta,
        imagen_sha256: huella,
        firmada_en_dispositivo: firmadaEn,
        dispositivo: dispositivoActual() || null,
        gps_estado: gps.estado,
        lat: gps.lat,
        lng: gps.lng,
        // hash_contenido lo pone la base; este valor se reemplaza.
        hash_contenido: "lo-pone-la-base",
      });
      if (error) throw new Error(error.message);
      setAviso(datos.rol === "tecnico" ? `✓ Firmó ${datos.nombre.trim()}. Pase el celular al siguiente.` : `✓ Firmó el capacitador.`);
      setDatos(null);
      await recargarFirmas();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  }

  async function guardarLista(nueva: Asistente[]) {
    setError(null);
    const { error } = await supabase.from("sst_formatos").update({ tecnicos_en_obra: nueva.length ? nueva : null }).eq("id", id);
    if (error) {
      setError(error.message);
      return false;
    }
    setAsistentes(nueva);
    return true;
  }

  async function cerrar() {
    setError(null);
    if (participantes.length === 0) return setError("Falta al menos un participante firmado.");
    if (!capacitador) return setError("Falta la firma del capacitador.");
    if (pendientes.length) return setError(`Faltan por firmar: ${pendientes.map((p) => p.nombre).join(", ")}.`);
    if (!confirm("¿Cerrar y sellar? Después no se agregan más firmas.")) return;
    setGuardando(true);
    const { data, error } = await supabase.from("sst_formatos").update({ estado: "firmado" }).eq("id", id).eq("estado", "borrador").select("estado");
    setGuardando(false);
    if (error) return setError(error.message);
    if (!data?.length) return setError("No se pudo cerrar (¿ya estaba cerrado?). Recargue la página.");
    setEstado("firmado");
    // Cierre del circuito: la capacitación sellada queda como evidencia del estándar 1.2.2.
    const ev = await usarComoEvidencia();
    setAviso(`Capacitación cerrada y sellada.${ev ? ` ${ev}` : ""}`);
  }

  /** Fila en sst_plan_evidencias con el FOR-02 (y opcionalmente un archivo ya subido a plan/{item}/). */
  async function amarrarEvidencia(descripcion: string, path: string | null): Promise<string | null> {
    if (!itemPlan) return "No está el estándar 1.2.2 en el plan de este año: créalo en Plan de trabajo.";
    const { data, error } = await supabase
      .from("sst_plan_evidencias")
      .insert({ item_id: itemPlan.id, descripcion, path, formato_id: id })
      .select("id, descripcion, path, subida_en")
      .single();
    if (error) return error.message;
    setEvidencias((e) => [...e, data as Evidencia]);
    return null;
  }

  async function usarComoEvidencia(): Promise<string | null> {
    if (evidencias.some((e) => e.path === null)) return null;
    const er = await amarrarEvidencia(`FOR-02 firmado: ${String(respuestas.tema ?? "capacitación")} (${fecha})`, null);
    if (er) {
      setError(`Quedó sellada, pero no se registró como evidencia del plan: ${er}`);
      return null;
    }
    return `Quedó como evidencia del estándar ${itemPlan?.codigo}.`;
  }

  async function subirEvaluacion(archivo: File) {
    setError(null);
    setAviso(null);
    if (!itemPlan) return setError("No está el estándar 1.2.2 en el plan de este año: créalo en Plan de trabajo.");
    setGuardando(true);
    try {
      const nombre = archivo.name.replace(/[^\w.\-]+/g, "_");
      // La ruta que exigen el CHECK de sst_plan_evidencias y la política de Storage (plan/{item}/...).
      const path = `plan/${itemPlan.id}/${Date.now()}-evaluacion-${id}-${nombre}`;
      const { error: eS } = await supabase.storage.from("sgsst").upload(path, archivo, { contentType: archivo.type || undefined, upsert: false });
      if (eS) throw new Error(`No se subió el archivo: ${eS.message}`);
      const er = await amarrarEvidencia(`Evaluación (Google Forms) de la capacitación: ${String(respuestas.tema ?? "")} (${fecha}) · ${archivo.name}`, path);
      if (er) throw new Error(er);
      setAviso("✓ Resultado de la evaluación guardado y amarrado a esta capacitación.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  }

  async function verArchivo(path: string) {
    const { data, error } = await supabase.storage.from("sgsst").createSignedUrl(path, 600);
    if (error || !data) return setError(`No se pudo abrir: ${error?.message ?? "sin enlace"}`);
    window.open(data.signedUrl, "_blank", "noopener");
  }

  if (leyendo) {
    return <VisorPdf url={leyendo.url} titulo={`${leyendo.material.nombre} · ${leyendo.quien.nombre.trim()}`} onCerrar={() => void cerrarMaterial()} />;
  }

  if (firmando && datos) {
    return (
      <FirmaPantallaCompleta
        titulo={`${datos.nombre.trim()} · CC ${datos.documento.trim()}`}
        onListo={(png) => void guardarFirma(png)}
        onCancelar={() => setFirmando(false)}
      />
    );
  }

  const tema = String(respuestas.tema ?? "");
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">FOR-02 · {ESTADO_FORMATO[estado] ?? estado}</p>
        <h1 className="text-xl font-bold text-slate-900">{tema || "Capacitación"}</h1>
        <p className="text-sm text-slate-600">
          {fecha}
          {respuestas.hora_realizacion ? ` · ${String(respuestas.hora_realizacion)}` : ""}
          {lugar ? ` · ${lugar}` : ""}
        </p>
        <button type="button" onClick={() => setVerEncabezado((v) => !v)} className="mt-1 min-h-11 text-sm text-slate-700 underline">
          {verEncabezado ? "Ocultar encabezado" : "Ver encabezado completo"}
        </button>
        {verEncabezado && (
          <div className="mt-2 rounded-xl border border-slate-200 p-3">
            <FormularioSst campos={campos} respuestas={respuestas} />
          </div>
        )}
      </div>

      {aviso && <p className="rounded-xl bg-green-50 px-4 py-3 text-lg font-semibold text-green-900">{aviso}</p>}
      {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-base text-red-800">{error}</p>}
      {guardando && <p className="rounded-xl bg-slate-100 px-4 py-3 text-lg">Guardando…</p>}

      {abierto && gestiona && !listaSellada && faltaEncabezado.length > 0 && !guardando && (
        <div className="space-y-3 rounded-2xl border-2 border-amber-500 bg-amber-50 p-4">
          <p className="text-base font-bold text-amber-900">Antes de firmar falta llenar: {faltaEncabezado.join(", ")}.</p>
          <FormularioSst campos={campos} respuestas={borradorEncabezado} onCambio={(c, v) => setBorradorEncabezado((r) => ({ ...r, [c]: v }))} />
          <button type="button" onClick={guardarEncabezado} className={`${BOTON_GRANDE} bg-slate-900 text-white`}>
            Guardar encabezado
          </button>
        </div>
      )}

      {/* Datos de quien firma */}
      {abierto && puedeTrabajar && datos && !guardando && (
        <div className="space-y-3 rounded-2xl border-2 border-slate-900 p-4">
          <p className="text-lg font-bold">{datos.rol === "tecnico" ? "Participante" : "Firma del capacitador"}</p>
          <label className="block text-sm font-medium">
            Nombre
            <input value={datos.nombre} onChange={(e) => setDatos({ ...datos, nombre: e.target.value })} readOnly={datos.rol === "tecnico"} className={CAMPO} />
          </label>
          <label className="block text-sm font-medium">
            Cédula
            <input value={datos.documento} inputMode="numeric" onChange={(e) => setDatos({ ...datos, documento: e.target.value })} readOnly={datos.rol === "tecnico"} className={CAMPO} />
          </label>
          <label className="block text-sm font-medium">
            Cargo
            <input value={datos.cargo} onChange={(e) => setDatos({ ...datos, cargo: e.target.value })} className={CAMPO} />
          </label>
          {datos.rol === "tecnico" && materiales.length > 0 && (
            <div className="space-y-2 rounded-xl bg-slate-50 p-3">
              <p className="text-base font-bold">1. Lea el material</p>
              {materiales.map((m) => {
                const hechas = lecturasDe(lecturas, m.id, datos.documento);
                return (
                  <div key={m.id} className="space-y-1">
                    <p className="text-sm">
                      {m.nombre}
                      {m.minutos_lectura ? <span className="text-slate-600"> · unos {m.minutos_lectura} min</span> : null}
                    </p>
                    {hechas.length > 0 && <p className="text-sm font-semibold text-green-800">✓ Leído ({duracion(hechas.reduce((t, l) => t + (l.segundos ?? 0), 0))})</p>}
                    <button
                      type="button"
                      onClick={() => void abrirMaterial(m, datos)}
                      className={`${BOTON_GRANDE} ${hechas.length ? "border-2 border-slate-900 text-slate-900" : "bg-blue-700 text-white"}`}
                    >
                      📖 {hechas.length ? "Abrir otra vez" : "Abrir y leer"}
                    </button>
                  </div>
                );
              })}
              <p className="pt-1 text-base font-bold">2. Firme</p>
            </div>
          )}
          <button
            type="button"
            onClick={aFirmar}
            disabled={datos.rol === "tecnico" && materialesSinLeer(materiales, lecturas, datos.documento).length > 0}
            className={`${BOTON_GRANDE} bg-slate-900 text-white disabled:bg-slate-300`}
          >
            Firmar
          </button>
          <button type="button" onClick={() => setDatos(null)} className="min-h-12 w-full rounded-xl border border-slate-400 text-base">
            Cancelar
          </button>
        </div>
      )}

      {/* Elegir el nombre */}
      {abierto && puedeTrabajar && !datos && eligiendo && !guardando && (
        <div className="space-y-2 rounded-2xl border-2 border-slate-900 p-4">
          {!gestiona ? (
            <>
              <label className="block text-lg font-bold">
                {porAbrir ? "Para leer, escriba su cédula" : "Escriba su cédula"}
                <input value={miCedula} inputMode="numeric" autoComplete="off" onChange={(e) => setMiCedula(e.target.value)} onKeyDown={(e) => e.key === "Enter" && seguirConCedula()} className={CAMPO} />
              </label>
              <button type="button" onClick={seguirConCedula} className={`${BOTON_GRANDE} bg-slate-900 text-white`}>
                Continuar
              </button>
            </>
          ) : (
            <p className="text-lg font-bold">{porAbrir ? "¿Quién va a leer? Toque su nombre" : "Toque su nombre"}</p>
          )}
          {gestiona && pendientes.length === 0 && <p className="text-base text-slate-600">Ya firmaron todos los de la lista.</p>}
          {gestiona && pendientes.map((a) => (
            <button
              key={a.documento}
              type="button"
              onClick={() => empezar({ rol: "tecnico", nombre: a.nombre, documento: a.documento, cargo: a.cargo ?? "" })}
              className="block min-h-14 w-full rounded-xl border border-slate-400 px-4 py-2 text-left text-lg active:bg-slate-100"
            >
              <span className="font-semibold">{a.nombre}</span>
              <span className="block text-sm text-slate-600">CC {a.documento}</span>
            </button>
          ))}
          <button type="button" onClick={() => (setEligiendo(false), setPorAbrir(null))} className="min-h-12 w-full rounded-xl border border-slate-400 text-base">
            Cancelar
          </button>
        </div>
      )}

      {/* Material de la capacitación: antes del botón de firmar */}
      {(materiales.length > 0 || materialesSinPublicar.length > 0) && !datos && !eligiendo && (
        <section className="space-y-2 rounded-2xl border-2 border-blue-700 p-4">
          <h2 className="text-lg font-bold text-slate-900">Material de la capacitación</h2>
          {materialesSinPublicar.length > 0 && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Esta capacitación exige {materialesSinPublicar.join(", ")}, pero no hay versión publicada. Se sube en SG-SST → Materiales de capacitación.
            </p>
          )}
          {materiales.map((m) => {
            const leyeron = new Set(lecturas.filter((l) => l.material_id === m.id && l.cerrado_en).map((l) => docComparable(l.documento)));
            const deLista = asistentes.filter((a) => leyeron.has(docComparable(a.documento))).length;
            return (
              <div key={m.id} className="space-y-2">
                <p className="text-base">
                  <span className="font-semibold">{m.nombre}</span>
                  <span className="block text-sm text-slate-600">
                    Versión {m.version}
                    {m.minutos_lectura ? ` · unos ${m.minutos_lectura} min` : ""}
                    {m.obligatorio ? " · se lee antes de firmar" : ""}
                    {asistentes.length > 0 && ` · lo leyeron ${deLista} de ${asistentes.length}`}
                  </span>
                </p>
                {abierto && puedeTrabajar && pendientes.length > 0 && (
                  <button
                    type="button"
                    disabled={guardando || asistentes.length === 0 || faltaEncabezado.length > 0}
                    onClick={() => (setAviso(null), setError(null), setPorAbrir(m), setEligiendo(true))}
                    className={`${BOTON_GRANDE} bg-blue-700 text-white disabled:bg-slate-300`}
                  >
                    📖 Abrir y leer
                  </button>
                )}
                {abierto && puedeTrabajar && asistentes.length === 0 && <p className="text-sm text-slate-600">Se abre cuando esté la lista de asistentes: cada lectura queda a nombre de quien lee.</p>}
              </div>
            );
          })}
        </section>
      )}

      {/* Listo para el siguiente */}
      {abierto && puedeTrabajar && !datos && !eligiendo && !guardando && (
        <div className="space-y-3">
          {faltaEncabezado.length > 0 ? (
            !gestiona && <p className="rounded-xl bg-amber-50 px-4 py-3 text-base text-amber-900">Al encabezado le falta: {faltaEncabezado.join(", ")}. Lo completa la responsable SG-SST.</p>
          ) : asistentes.length === 0 ? (
            <p className="rounded-xl bg-amber-50 px-4 py-3 text-base text-amber-900">{gestiona ? "Primero anote la lista de asistentes (abajo). Sin lista la base no deja firmar." : "Todavía no hay lista de asistentes: la arma la responsable SG-SST."}</p>
          ) : (
            <button type="button" onClick={() => (setAviso(null), setError(null), setEligiendo(true))} disabled={pendientes.length === 0} className={`${BOTON_GRANDE} bg-slate-900 text-white disabled:bg-slate-300`}>
              {pendientes.length ? (gestiona ? `Firmar (${pendientes.length} por firmar)` : "Leer y firmar con mi cédula") : "Ya firmaron todos"}
            </button>
          )}
          {gestiona && !capacitador && asistentes.length > 0 && faltaEncabezado.length === 0 && (
            <button
              type="button"
              onClick={() => empezar({ rol: "responsable_sst", nombre: String(respuestas.dirigida_por ?? ""), documento: "", cargo: "" })}
              className={`${BOTON_GRANDE} border-2 border-slate-900 text-slate-900`}
            >
              Firma del capacitador
            </button>
          )}
          {gestiona && (
            <button type="button" onClick={cerrar} className="min-h-14 w-full rounded-2xl bg-green-700 px-4 text-lg font-semibold text-white">
              Cerrar y sellar
            </button>
          )}
        </div>
      )}

      {gestiona && <PanelFirmas asistentes={asistentes} firmas={firmas} lecturas={lecturas} materiales={materiales} />}

      {gestiona && (
        <section className="space-y-2 rounded-2xl border border-slate-300 p-4">
          <h2 className="text-base font-bold text-slate-900">Evidencias del plan{itemPlan ? ` · estándar ${itemPlan.codigo}` : ""}</h2>
          {!itemPlan && <p className="text-sm text-amber-800">No hay ítem 1.2.2 en el plan del año {fecha.slice(0, 4)}: sin él no se puede amarrar la evidencia.</p>}
          {evidencias.length === 0 && <p className="text-sm text-slate-600">Todavía nada amarrado a esta capacitación.</p>}
          <ul className="space-y-1">
            {evidencias.map((e) => (
              <li key={e.id} className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
                <p>{e.descripcion}</p>
                <p className="text-xs text-slate-600">
                  {fechaHoraCorta(e.subida_en)}
                  {e.path && (
                    <button type="button" onClick={() => void verArchivo(e.path!)} className="ml-2 min-h-9 underline">
                      Ver archivo
                    </button>
                  )}
                </p>
              </li>
            ))}
          </ul>
          {itemPlan && estado !== "borrador" && estado !== "anulado" && !evidencias.some((e) => e.path === null) && (
            <button type="button" disabled={guardando} onClick={() => void usarComoEvidencia().then((m) => m && setAviso(m))} className="min-h-12 w-full rounded-xl border-2 border-slate-900 text-base font-semibold">
              Usar como evidencia del plan ({itemPlan.codigo})
            </button>
          )}
          {itemPlan && (
            <label className="block min-h-12 w-full cursor-pointer rounded-xl bg-slate-900 px-4 py-3 text-center text-base font-semibold text-white">
              Subir resultado de la evaluación (Forms: PDF o Excel)
              <input
                type="file"
                accept=".pdf,.xlsx,.xls,.csv,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
                className="hidden"
                disabled={guardando}
                onChange={(ev) => {
                  const a = ev.target.files?.[0];
                  ev.target.value = "";
                  if (a) void subirEvaluacion(a);
                }}
              />
            </label>
          )}
        </section>
      )}

      {/* Firmas capturadas */}
      <section className="space-y-2">
        <h2 className="text-base font-bold text-slate-900">
          Firmas ({participantes.length} participante{participantes.length === 1 ? "" : "s"}
          {capacitador ? " + capacitador" : ""})
        </h2>
        {firmas.length === 0 && <p className="text-sm text-slate-600">Todavía nadie ha firmado.</p>}
        <ul className="space-y-1">
          {firmas.map((f) => (
            <li key={f.id} className="rounded-lg bg-slate-50 px-3 py-2">
              <p className="font-semibold">
                {f.nombre} {f.rol === "responsable_sst" && <span className="text-sm font-normal text-slate-600">(capacitador)</span>}
              </p>
              <p className="text-sm text-slate-600">
                CC {f.documento}
                {f.cargo ? ` · ${f.cargo}` : ""}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <ListaAsistentes
        asistentes={asistentes}
        pendientes={pendientes}
        editable={abierto && gestiona && !listaSellada}
        onGuardar={guardarLista}
        lectura={(doc) => {
          if (!materiales.length) return null;
          const hechas = materiales.flatMap((m) => lecturasDe(lecturas, m.id, doc));
          return hechas.length ? `📖 leyó ${duracion(hechas.reduce((t, l) => t + (l.segundos ?? 0), 0))}` : "sin leer el material";
        }}
      />
    </div>
  );
}

function ListaAsistentes({
  asistentes,
  pendientes,
  editable,
  onGuardar,
  lectura,
}: {
  asistentes: Asistente[];
  pendientes: Asistente[];
  editable: boolean;
  onGuardar: (nueva: Asistente[]) => Promise<boolean>;
  /** Cuánto leyó el material (null si la capacitación no tiene material). */
  lectura: (documento: string) => string | null;
}) {
  const [nombre, setNombre] = useState("");
  const [documento, setDocumento] = useState("");
  const [cargo, setCargo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const pendiente = new Set(pendientes.map((p) => docComparable(p.documento)));

  async function agregar() {
    setError(null);
    if (!nombre.trim() || !docComparable(documento)) return setError("Escriba nombre y cédula.");
    if (asistentes.some((a) => docComparable(a.documento) === docComparable(documento))) return setError("Esa cédula ya está en la lista.");
    const ok = await onGuardar([...asistentes, { nombre: nombre.trim(), documento: documento.trim(), cargo: cargo.trim() || null }]);
    if (ok) {
      setNombre("");
      setDocumento("");
      setCargo("");
    }
  }

  return (
    <section className="space-y-2">
      <h2 className="text-base font-bold text-slate-900">Lista de asistentes ({asistentes.length})</h2>
      {editable ? (
        <p className="text-sm text-amber-800">Anote a todos antes de la primera firma: cuando firme el primero, la lista queda cerrada y solo pueden firmar los que estén en ella.</p>
      ) : (
        asistentes.length > 0 && <p className="text-sm text-slate-600">La lista quedó cerrada con la primera firma.</p>
      )}
      <ul className="space-y-1">
        {asistentes.map((a) => (
          <li key={a.documento} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="font-medium">{a.nombre}</p>
              <p className="text-sm text-slate-600">
                CC {a.documento}
                {a.cargo ? ` · ${a.cargo}` : ""}
                {!pendiente.has(docComparable(a.documento)) && " · ✓ firmó"}
                {lectura(a.documento) && ` · ${lectura(a.documento)}`}
              </p>
            </div>
            {editable && (
              <button type="button" onClick={() => void onGuardar(asistentes.filter((x) => x !== a))} className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm">
                Quitar
              </button>
            )}
          </li>
        ))}
      </ul>
      {editable && (
        <div className="space-y-2 rounded-xl border border-slate-300 p-3">
          <input placeholder="Nombre completo" value={nombre} onChange={(e) => setNombre(e.target.value)} className={CAMPO} />
          <input placeholder="Cédula" inputMode="numeric" value={documento} onChange={(e) => setDocumento(e.target.value)} className={CAMPO} />
          <input placeholder="Cargo" value={cargo} onChange={(e) => setCargo(e.target.value)} className={CAMPO} />
          {error && <p className="text-sm text-red-800">{error}</p>}
          <button type="button" onClick={agregar} className="min-h-12 w-full rounded-xl bg-slate-800 text-base font-semibold text-white">
            Agregar a la lista
          </button>
        </div>
      )}
    </section>
  );
}

const fechaHoraCorta = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("es-CO", { timeZone: "America/Bogota", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";

/** Para la responsable: cada asistente con su firma (hora) y cuánto leyó; quien falta, primero. */
function PanelFirmas({ asistentes, firmas, lecturas, materiales }: { asistentes: Asistente[]; firmas: Firma[]; lecturas: Lectura[]; materiales: Material[] }) {
  if (!asistentes.length) return null;
  const filas = asistentes
    .map((a) => {
      const d = docComparable(a.documento);
      const firma = firmas.find((f) => f.rol === "tecnico" && docComparable(f.documento) === d);
      const leidas = materiales.flatMap((m) => lecturasDe(lecturas, m.id, a.documento));
      const abiertas = lecturas.filter((l) => docComparable(l.documento) === d && !l.cerrado_en).length;
      return { a, firma, segundos: leidas.reduce((t, l) => t + (l.segundos ?? 0), 0), leyo: leidas.length > 0, abiertas };
    })
    .sort((x, y) => Number(!!x.firma) - Number(!!y.firma));
  const faltan = filas.filter((f) => !f.firma).length;
  return (
    <section className="space-y-2 rounded-2xl border-2 border-slate-900 p-4">
      <h2 className="text-base font-bold text-slate-900">
        Quién firmó: {asistentes.length - faltan} de {asistentes.length}
        {faltan > 0 ? <span className="text-amber-800"> · faltan {faltan}</span> : <span className="text-green-700"> · completos</span>}
      </h2>
      <ul className="divide-y divide-slate-200">
        {filas.map(({ a, firma, segundos, leyo, abiertas }) => (
          <li key={a.documento} className="flex items-start justify-between gap-2 py-2">
            <div className="min-w-0">
              <p className="font-semibold">{a.nombre}</p>
              <p className="text-sm text-slate-600">
                CC {a.documento}
                {materiales.length > 0 && (leyo ? ` · 📖 ${duracion(segundos)}` : abiertas ? " · material abierto sin cerrar" : " · sin leer")}
              </p>
            </div>
            {firma ? (
              <span className="shrink-0 rounded-md bg-green-50 px-2 py-1 text-right text-sm text-green-800">
                ✓ firmó
                <span className="block text-xs">{fechaHoraCorta(firma.firmada_en_dispositivo ?? firma.recibida_en)}</span>
              </span>
            ) : (
              <span className="shrink-0 rounded-md bg-amber-100 px-2 py-1 text-sm font-semibold text-amber-900">falta</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
