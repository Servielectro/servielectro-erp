"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { FormularioSst } from "@/components/sst/FormularioSst";
import { VisorPdf } from "@/components/sst/VisorPdf";
import { FirmaPantallaCompleta } from "@/app/(campo)/tecnico/FirmaPantallaCompleta";
import { obtenerUbicacion, sha256 } from "@/lib/tecnico/captura";
import type { Ubicacion } from "@/lib/tecnico/db";
import { dispositivoActual } from "@/lib/sst/local";
import type { Campo } from "@/lib/sst/plantillas";
import { cerrarAlSalir, duracion, lecturasDe, materialesSinLeer, urlFirmada, type Lectura, type Material } from "@/lib/sst/materiales";

const BOTON = "flex min-h-14 w-full items-center justify-center rounded-xl px-4 text-lg font-bold";

/**
 * El convocado lee el material y firma A SU NOMBRE (el de la convocatoria). La base lo exige igual:
 * rol participante, su cédula, formato en borrador (migración 131). Encabezado, lista y sello no
 * están aquí: son de SG-SST.
 */
export function FirmarConvocado({
  formatoId,
  yo,
  yaFirme,
  campos,
  respuestas,
  materiales,
  materialesSinPublicar,
  lecturasIniciales,
}: {
  formatoId: string;
  yo: { nombre: string; documento: string; cargo: string };
  yaFirme: boolean;
  campos: Campo[];
  respuestas: Record<string, unknown>;
  materiales: Material[];
  materialesSinPublicar: string[];
  lecturasIniciales: Lectura[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const [firme, setFirme] = useState(yaFirme);
  const [lecturas, setLecturas] = useState(lecturasIniciales);
  const [leyendo, setLeyendo] = useState<{ material: Material; lecturaId: string; url: string; token: string } | null>(null);
  const [firmando, setFirmando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [verEncabezado, setVerEncabezado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const ubicacion = useRef<Promise<Ubicacion> | null>(null);

  useEffect(() => {
    if (!leyendo) return;
    const alSalir = () => cerrarAlSalir(leyendo.lecturaId, leyendo.token);
    window.addEventListener("pagehide", alSalir);
    return () => window.removeEventListener("pagehide", alSalir);
  }, [leyendo]);

  const sinLeer = materialesSinLeer(materiales, lecturas, yo.documento);

  async function abrir(m: Material) {
    setError(null);
    setAviso(null);
    setGuardando(true);
    try {
      const { data: sesion } = await supabase.auth.getSession();
      const token = sesion.session?.access_token;
      if (!token) throw new Error("La sesión se cerró: vuelve a entrar.");
      const url = await urlFirmada(supabase, m.path);
      const { data: lecturaId, error } = await supabase.rpc("fn_sst_material_abrir", {
        p_material: m.id,
        p_formato: formatoId,
        p_persona: yo.nombre,
        p_documento: yo.documento,
        p_dispositivo: dispositivoActual() || null,
      });
      if (error) throw new Error(error.message);
      setLecturas((ls) => [...ls, { id: lecturaId as string, material_id: m.id, persona: yo.nombre, documento: yo.documento, abierto_en: new Date().toISOString(), cerrado_en: null, segundos: null }]);
      setLeyendo({ material: m, lecturaId: lecturaId as string, url, token });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  }

  async function cerrarLectura() {
    if (!leyendo) return;
    const l = leyendo;
    setLeyendo(null);
    const { data: segundos, error } = await supabase.rpc("fn_sst_material_cerrar", { p_lectura: l.lecturaId });
    if (error) return setError(`No se pudo registrar el cierre de la lectura: ${error.message}`);
    const seg = (segundos as number | null) ?? 0;
    setLecturas((ls) => ls.map((x) => (x.id === l.lecturaId ? { ...x, cerrado_en: new Date().toISOString(), segundos: seg } : x)));
    setAviso(`✓ Leíste «${l.material.nombre}» (${duracion(seg)}).`);
  }

  function aFirmar() {
    if (sinLeer.length) return setError("Primero lee el material.");
    setError(null);
    ubicacion.current = obtenerUbicacion();
    setFirmando(true);
  }

  async function guardarFirma(png: Blob) {
    setFirmando(false);
    setGuardando(true);
    setError(null);
    try {
      const firmaId = crypto.randomUUID();
      const ruta = `formatos/${formatoId}/firma-${firmaId}.png`;
      const [huella, gps] = await Promise.all([sha256(png), ubicacion.current ?? obtenerUbicacion()]);
      const subida = await supabase.storage.from("sgsst").upload(ruta, png, { contentType: "image/png", upsert: false });
      if (subida.error) throw new Error(`No se pudo subir la firma: ${subida.error.message}`);
      const { error } = await supabase.from("sst_formato_firmas").insert({
        id: firmaId,
        formato_id: formatoId,
        rol: "tecnico",
        nombre: yo.nombre,
        documento: yo.documento,
        cargo: yo.cargo.trim() || null,
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
      setFirme(true);
      setAviso("✓ Firmaste. Ya quedó registrado.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  }

  if (leyendo) return <VisorPdf url={leyendo.url} titulo={`${leyendo.material.nombre} · ${yo.nombre}`} onCerrar={() => void cerrarLectura()} />;
  if (firmando) return <FirmaPantallaCompleta titulo={`${yo.nombre} · CC ${yo.documento}`} onListo={(png) => void guardarFirma(png)} onCancelar={() => setFirmando(false)} />;

  return (
    <div className="space-y-4">
      {aviso && <p className="rounded-xl bg-green-50 px-4 py-3 text-lg font-semibold text-green-900">{aviso}</p>}
      {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-base text-red-800">{error}</p>}
      {guardando && <p className="rounded-xl bg-white px-4 py-3 text-lg">Guardando…</p>}

      <section className="rounded-xl border border-slate-300 bg-white p-3">
        <p className="text-sm text-slate-600">Firmas como</p>
        <p className="text-lg font-bold">{yo.nombre}</p>
        <p className="text-base">
          CC {yo.documento}
          {yo.cargo ? ` · ${yo.cargo}` : ""}
        </p>
        <p className="mt-1 text-xs text-slate-500">Si tu nombre o cédula están mal, no firmes: avísale a la responsable SG-SST.</p>
      </section>

      <div>
        <button type="button" onClick={() => setVerEncabezado((v) => !v)} className="min-h-11 text-sm text-slate-700 underline">
          {verEncabezado ? "Ocultar de qué se trata" : "Ver de qué se trata"}
        </button>
        {verEncabezado && (
          <div className="mt-2 rounded-xl border border-slate-200 bg-white p-3">
            <FormularioSst campos={campos} respuestas={respuestas} />
          </div>
        )}
      </div>

      {firme ? (
        <div className="space-y-3">
          <p className="rounded-xl bg-green-50 px-4 py-3 text-lg font-semibold text-green-900">✓ Ya firmaste este documento.</p>
          <Link href="/tecnico/por-firmar" className={`${BOTON} border-2 border-slate-900 text-slate-900`}>
            Volver a mis documentos
          </Link>
        </div>
      ) : (
        <>
          {materialesSinPublicar.length > 0 && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">Falta que SG-SST publique el material ({materialesSinPublicar.join(", ")}). Vuelve más tarde.</p>
          )}
          {materiales.length > 0 && (
            <section className="space-y-2 rounded-xl border-2 border-blue-700 bg-white p-3">
              <p className="text-base font-bold">1. Lee el material</p>
              {materiales.map((m) => {
                const hechas = lecturasDe(lecturas, m.id, yo.documento);
                return (
                  <div key={m.id} className="space-y-1">
                    <p className="text-sm">
                      {m.nombre}
                      {m.minutos_lectura ? <span className="text-slate-600"> · unos {m.minutos_lectura} min</span> : null}
                    </p>
                    {hechas.length > 0 && <p className="text-sm font-semibold text-green-800">✓ Leído ({duracion(hechas.reduce((t, l) => t + (l.segundos ?? 0), 0))})</p>}
                    <button type="button" disabled={guardando} onClick={() => void abrir(m)} className={`${BOTON} ${hechas.length ? "border-2 border-slate-900 text-slate-900" : "bg-blue-700 text-white"}`}>
                      📖 {hechas.length ? "Abrir otra vez" : "Abrir y leer"}
                    </button>
                  </div>
                );
              })}
            </section>
          )}
          <section className="space-y-2">
            {materiales.length > 0 && <p className="text-base font-bold">2. Firma</p>}
            <button
              type="button"
              onClick={aFirmar}
              disabled={guardando || sinLeer.length > 0}
              className={`${BOTON} bg-slate-900 text-white disabled:bg-slate-300`}
            >
              Firmar
            </button>
            {sinLeer.length > 0 && <p className="text-sm text-slate-600">Se habilita cuando abras y cierres el material.</p>}
          </section>
        </>
      )}
    </div>
  );
}
