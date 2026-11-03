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
    const { data } = await supabase.from("sst_formato_firmas").select("id, rol, nombre, documento, cargo").eq("formato_id", id).order("recibida_en");
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
    setAviso("Capacitación cerrada y sellada.");
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

      {abierto && puedeTrabajar && !listaSellada && faltaEncabezado.length > 0 && !guardando && (
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
          <p className="text-lg font-bold">{porAbrir ? "¿Quién va a leer? Toque su nombre" : "Toque su nombre"}</p>
          {pendientes.length === 0 && <p className="text-base text-slate-600">Ya firmaron todos los de la lista.</p>}
          {pendientes.map((a) => (
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
                {abierto && puedeTrabajar && (
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
          {faltaEncabezado.length > 0 ? null : asistentes.length === 0 ? (
            <p className="rounded-xl bg-amber-50 px-4 py-3 text-base text-amber-900">Primero anote la lista de asistentes (abajo). Sin lista la base no deja firmar.</p>
          ) : (
            <button type="button" onClick={() => (setAviso(null), setError(null), setEligiendo(true))} disabled={pendientes.length === 0} className={`${BOTON_GRANDE} bg-slate-900 text-white disabled:bg-slate-300`}>
              {pendientes.length ? `Firmar (${pendientes.length} por firmar)` : "Ya firmaron todos"}
            </button>
          )}
          {!capacitador && asistentes.length > 0 && faltaEncabezado.length === 0 && (
            <button
              type="button"
              onClick={() => empezar({ rol: "responsable_sst", nombre: String(respuestas.dirigida_por ?? ""), documento: "", cargo: "" })}
              className={`${BOTON_GRANDE} border-2 border-slate-900 text-slate-900`}
            >
              Firma del capacitador
            </button>
          )}
          <button type="button" onClick={cerrar} className="min-h-14 w-full rounded-2xl bg-green-700 px-4 text-lg font-semibold text-white">
            Cerrar y sellar
          </button>
        </div>
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
        editable={abierto && puedeTrabajar && !listaSellada}
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
