"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { FirmaPantallaCompleta } from "@/app/(campo)/tecnico/FirmaPantallaCompleta";
import { obtenerUbicacion, sha256 } from "@/lib/tecnico/captura";
import type { Ubicacion } from "@/lib/tecnico/db";
import { dispositivoActual } from "@/lib/sst/local";

const BOTON = "flex min-h-14 w-full items-center justify-center rounded-xl px-4 text-base font-bold";
const CAMPO = "mt-0.5 w-full min-h-12 rounded-lg border border-slate-300 bg-white px-3 text-base";

export interface Firmante {
  nombre: string;
  documento: string;
  cargo: string;
  empresa: string;
}

type Rol = "responsable_sst" | "sst_cliente";
type Paso =
  | null
  | { modo: "sitio" | "enviar" | "solo"; quien: Rol; etapa: "datos" | "firma" }
  | { modo: "sitio"; quien: "pasar"; etapa: "datos" };

/**
 * Acta con cierre automático (migración 139, hoy solo PRY-ACTA-INICIO): se sella sola al entrar la
 * última firma obligatoria y el disparador de la 137 la publica en el portal. Dos caminos:
 *   1. «Firmar aquí con el cliente»: firma el contratista y enseguida, en el MISMO dispositivo, el
 *      contratante. Al entrar la segunda, la base la sella y publica; la pantalla se refresca sola.
 *   2. «Firmar y enviar al cliente»: firma el contratista y se llama fn_sst_enviar_al_cliente; el
 *      contratante firma desde su portal y ahí se sella.
 * Los mensajes de la base se muestran tal cual ("Antes de firmar falta llenar: …").
 */
export function FirmasActa({
  formatoId,
  etiquetas,
  contratistaFirmo,
  contratanteFirmo,
  enviada,
  otrasFaltan,
  inicialContratista,
  inicialContratante,
}: {
  formatoId: string;
  etiquetas: { contratista: string; contratante: string };
  contratistaFirmo: boolean;
  contratanteFirmo: boolean;
  enviada: boolean;
  /** Otras firmas obligatorias de la plantilla (fuera de estas dos) que faltan. */
  otrasFaltan: string[];
  inicialContratista: Firmante;
  inicialContratante: Firmante;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [paso, setPaso] = useState<Paso>(null);
  const [contratista, setContratista] = useState(inicialContratista);
  const [contratante, setContratante] = useState(inicialContratante);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [firmados, setFirmados] = useState({ contratista: contratistaFirmo, contratante: contratanteFirmo });
  const ubicacion = useRef<Promise<Ubicacion> | null>(null);

  const datosDe = (r: Rol) => (r === "responsable_sst" ? contratista : contratante);
  const etiquetaDe = (r: Rol) => (r === "responsable_sst" ? etiquetas.contratista : etiquetas.contratante);
  const doc = (d: Firmante) => d.documento.replace(/[^0-9A-Za-z]/g, "");

  function aFirma(r: Rol, modo: "sitio" | "enviar" | "solo") {
    const d = datosDe(r);
    setError(null);
    if (d.nombre.trim().length < 3) return setError("Escribe el nombre completo de quien firma.");
    if (doc(d).length < 5) return setError("Escribe el número de cédula de quien firma.");
    ubicacion.current = obtenerUbicacion();
    setPaso({ modo, quien: r, etapa: "firma" });
  }

  async function guardarFirma(r: Rol, modo: "sitio" | "enviar" | "solo", png: Blob) {
    setPaso(null);
    setGuardando(true);
    setError(null);
    setAviso(null);
    const d = datosDe(r);
    try {
      const firmaId = crypto.randomUUID();
      const ruta = `formatos/${formatoId}/firma-${firmaId}.png`;
      const [huella, gps] = await Promise.all([sha256(png), ubicacion.current ?? obtenerUbicacion()]);
      const subida = await supabase.storage.from("sgsst").upload(ruta, png, { contentType: "image/png", upsert: false });
      if (subida.error) throw new Error(`No se pudo subir la firma: ${subida.error.message}`);
      // Sin .select(): la fila la completa la base (hash, quién, cuándo) y el disparador de la 139 sella si ya están todas.
      const { error } = await supabase.from("sst_formato_firmas").insert({
        id: firmaId,
        formato_id: formatoId,
        rol: r,
        nombre: d.nombre.trim(),
        documento: doc(d),
        cargo: d.cargo.trim() || null,
        empresa: d.empresa.trim() || null,
        imagen_path: ruta,
        imagen_sha256: huella,
        firmada_en_dispositivo: new Date().toISOString(),
        dispositivo: dispositivoActual() || null,
        gps_estado: gps.estado,
        lat: gps.lat,
        lng: gps.lng,
        hash_contenido: "lo-pone-la-base",
      });
      if (error) throw new Error(error.message);
      const ahora = { ...firmados, [r === "responsable_sst" ? "contratista" : "contratante"]: true };
      setFirmados(ahora);

      if (modo === "enviar") {
        const env = await supabase.rpc("fn_sst_enviar_al_cliente", { p_formato: formatoId });
        if (env.error) {
          setError(`Tu firma quedó registrada, pero no se pudo enviar al cliente: ${env.error.message}`);
        } else {
          setAviso("Firmaste y el acta quedó enviada al cliente. Cuando él firme desde su portal, se sella y se publica sola.");
        }
      } else if (modo === "sitio" && r === "responsable_sst" && !ahora.contratante) {
        // Enseguida la del contratante, en este mismo dispositivo.
        setPaso({ modo: "sitio", quien: "pasar", etapa: "datos" });
      } else if (ahora.contratista && ahora.contratante && otrasFaltan.length === 0) {
        setAviso("✓ Firmaron los dos: el acta quedó sellada y publicada en el portal del cliente.");
      } else {
        setAviso("Firma registrada.");
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  }

  if (paso && paso.quien !== "pasar" && paso.etapa === "firma") {
    const r = paso.quien;
    const d = datosDe(r);
    const modo = paso.modo;
    return (
      <FirmaPantallaCompleta
        titulo={`${etiquetaDe(r)} · ${d.nombre.trim()} · CC ${doc(d)}`}
        onListo={(png) => void guardarFirma(r, modo, png)}
        onCancelar={() => setPaso(null)}
      />
    );
  }

  const formulario = (r: Rol) => {
    const d = datosDe(r);
    const set = r === "responsable_sst" ? setContratista : setContratante;
    return (
      <div className="space-y-2">
        <label className="block">
          <span className="text-sm text-slate-600">Nombre completo</span>
          <input value={d.nombre} onChange={(e) => set({ ...d, nombre: e.target.value })} className={CAMPO} />
        </label>
        <label className="block">
          <span className="text-sm text-slate-600">Cédula</span>
          <input value={d.documento} onChange={(e) => set({ ...d, documento: e.target.value })} inputMode="numeric" className={CAMPO} />
        </label>
        <label className="block">
          <span className="text-sm text-slate-600">{r === "sst_cliente" ? "En calidad de" : "Cargo"}</span>
          <input value={d.cargo} onChange={(e) => set({ ...d, cargo: e.target.value })} className={CAMPO} />
        </label>
        <label className="block">
          <span className="text-sm text-slate-600">{r === "sst_cliente" ? "Entidad que representa" : "Empresa"}</span>
          <input value={d.empresa} onChange={(e) => set({ ...d, empresa: e.target.value })} className={CAMPO} />
        </label>
      </div>
    );
  };

  // En sitio, entre la primera y la segunda firma: se le pasa el dispositivo al contratante.
  if (paso?.quien === "pasar") {
    return (
      <section className="space-y-3 rounded-xl border-2 border-amber-500 bg-amber-50 p-4">
        <p className="text-lg font-bold text-amber-900">✓ Firmó el contratista. Ahora pásale el dispositivo al contratante.</p>
        <p className="text-sm text-amber-900">
          {etiquetas.contratante}: revise sus datos (la cédula la escribe usted) y firme. Puede leer el acta completa más abajo antes de firmar.
        </p>
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-base text-red-800">{error}</p>}
        <div className="rounded-xl bg-white p-3">{formulario("sst_cliente")}</div>
        <button type="button" disabled={guardando} onClick={() => aFirma("sst_cliente", "sitio")} className={`${BOTON} bg-slate-900 text-white disabled:bg-slate-400`}>
          Firmar como contratante
        </button>
        <button type="button" onClick={() => setPaso(null)} className="min-h-11 w-full text-sm text-slate-700 underline">
          Ahora no (el acta queda en borrador con la firma del contratista)
        </button>
      </section>
    );
  }

  if (paso && paso.etapa === "datos") {
    const r = paso.quien as Rol;
    const modo = paso.modo;
    return (
      <section className="space-y-3 rounded-xl border-2 border-slate-900 bg-white p-4">
        <h2 className="text-lg font-bold">{etiquetaDe(r)}</h2>
        {modo === "sitio" && r === "responsable_sst" && <p className="text-sm text-slate-600">Después de tu firma, en este mismo dispositivo, firma el contratante.</p>}
        {modo === "enviar" && <p className="text-sm text-slate-600">Después de tu firma, el acta se le envía al cliente para que firme desde su portal.</p>}
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-base text-red-800">{error}</p>}
        {formulario(r)}
        <button type="button" disabled={guardando} onClick={() => aFirma(r, modo)} className={`${BOTON} bg-slate-900 text-white disabled:bg-slate-400`}>
          Firmar
        </button>
        <button type="button" onClick={() => setPaso(null)} className="min-h-11 w-full text-sm text-slate-700 underline">
          Cancelar
        </button>
      </section>
    );
  }

  const ambos = firmados.contratista && firmados.contratante;
  return (
    <section className="space-y-2 rounded-lg border border-slate-300 bg-white p-3">
      <h2 className="text-sm font-semibold text-slate-900">Firmas del acta</h2>
      <ul className="space-y-1 text-sm">
        <li>
          {firmados.contratista ? "✓" : "○"} {etiquetas.contratista}
          {firmados.contratista ? "" : " — falta"}
        </li>
        <li>
          {firmados.contratante ? "✓" : "○"} {etiquetas.contratante}
          {firmados.contratante ? "" : enviada ? " — pendiente en su portal" : " — falta"}
        </li>
        {otrasFaltan.map((o) => (
          <li key={o}>○ {o} — falta</li>
        ))}
      </ul>
      {aviso && <p className="rounded-md bg-green-50 px-3 py-2 text-sm font-semibold text-green-800">{aviso}</p>}
      {error && <p className="whitespace-pre-wrap rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
      {guardando && <p className="text-sm text-slate-600">Guardando…</p>}

      {!ambos && !firmados.contratista && (
        <div className="grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            disabled={guardando}
            onClick={() => setPaso({ modo: "sitio", quien: "responsable_sst", etapa: "datos" })}
            className={`${BOTON} bg-slate-900 text-white disabled:bg-slate-400`}
          >
            Firmar aquí con el cliente
          </button>
          {!enviada && (
            <button
              type="button"
              disabled={guardando}
              onClick={() => setPaso({ modo: "enviar", quien: "responsable_sst", etapa: "datos" })}
              className={`${BOTON} border-2 border-slate-900 text-slate-900 disabled:border-slate-300 disabled:text-slate-400`}
            >
              Firmar y enviar al cliente
            </button>
          )}
          {enviada && (
            <button
              type="button"
              disabled={guardando}
              onClick={() => setPaso({ modo: "solo", quien: "responsable_sst", etapa: "datos" })}
              className={`${BOTON} border-2 border-slate-900 text-slate-900 disabled:border-slate-300 disabled:text-slate-400`}
            >
              Firmar (el cliente firma en su portal)
            </button>
          )}
        </div>
      )}

      {/* Ya firmó el contratista: el contratante firma aquí (está en sitio) o se le envía. */}
      {firmados.contratista && !firmados.contratante && (
        <div className="grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            disabled={guardando}
            onClick={() => setPaso({ modo: "sitio", quien: "pasar", etapa: "datos" })}
            className={`${BOTON} bg-slate-900 text-white disabled:bg-slate-400`}
          >
            El cliente firma aquí
          </button>
          {!enviada && (
            <button
              type="button"
              disabled={guardando}
              onClick={async () => {
                setError(null);
                setGuardando(true);
                const env = await supabase.rpc("fn_sst_enviar_al_cliente", { p_formato: formatoId });
                setGuardando(false);
                if (env.error) return setError(env.error.message);
                setAviso("Enviada al cliente. Cuando firme desde su portal, se sella y se publica sola.");
                router.refresh();
              }}
              className={`${BOTON} border-2 border-slate-900 text-slate-900 disabled:border-slate-300 disabled:text-slate-400`}
            >
              Enviar al cliente
            </button>
          )}
        </div>
      )}

      {/* Firmó el contratante primero (desde su portal): falta la del contratista y con ella se cierra. */}
      {!firmados.contratista && firmados.contratante && (
        <p className="text-sm text-slate-600">Ya firmó el contratante. Con tu firma el acta queda sellada y publicada.</p>
      )}
      {!firmados.contratista && firmados.contratante && (
        <button
          type="button"
          disabled={guardando}
          onClick={() => setPaso({ modo: "solo", quien: "responsable_sst", etapa: "datos" })}
          className={`${BOTON} bg-slate-900 text-white disabled:bg-slate-400`}
        >
          Firmar como contratista
        </button>
      )}

      {otrasFaltan.length > 0 && <p className="text-xs text-slate-500">Las demás firmas obligatorias se toman desde «Seguir llenando / firmar» en campo.</p>}
    </section>
  );
}
