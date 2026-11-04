"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { FirmaPantallaCompleta } from "@/app/(campo)/tecnico/FirmaPantallaCompleta";
import { obtenerUbicacion } from "@/lib/tecnico/captura";
import type { Ubicacion } from "@/lib/tecnico/db";
import { registrarFirmaEnLinea } from "@/lib/sst/firmar-en-linea";
import { problemaCedula, problemaNombre, soloDigitos } from "@/lib/sst/documento";

const BOTON = "flex min-h-14 w-full items-center justify-center rounded-xl px-4 text-lg font-bold";
const CAMPO = "mt-0.5 w-full min-h-12 rounded-lg border border-slate-300 bg-white px-3 text-base";

/**
 * El contratante firma el acta (rol sst_cliente), con la MISMA firma a pantalla completa y el mismo
 * registro que usa el técnico: imagen en sgsst/formatos/{id}/firma-{uuid}.png con su huella, hora
 * del dispositivo, GPS si lo da, y la huella del contenido la pone la base.
 *
 * Quien firma es una PERSONA, no la cuenta: la cuenta del portal es del conjunto ("Tintala Fase VI") y
 * firma quien esté ese día (Jhojan: "no muchas veces es el mismo del contrato"). Por eso nombre y
 * apellido, cédula y calidad se escriben aquí; se precargan de lo que dice el acta, editables, y nunca
 * del nombre de la cuenta. La razón social del conjunto va aparte, como entidad que representa.
 */
export function FirmarContratante({
  formatoId,
  yaFirmo,
  inicial,
  calidades,
}: {
  formatoId: string;
  yaFirmo: boolean;
  inicial: { nombre: string; documento: string; cargo: string; empresa: string };
  /** Opciones de «En calidad de» de la plantilla (Administrador, Representante legal…). */
  calidades: string[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [firmo, setFirmo] = useState(yaFirmo);
  const [nombre, setNombre] = useState(inicial.nombre);
  const [documento, setDocumento] = useState(inicial.documento);
  const [cargo, setCargo] = useState(inicial.cargo);
  const [empresa, setEmpresa] = useState(inicial.empresa);
  const [leido, setLeido] = useState(false);
  const [firmando, setFirmando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ubicacion = useRef<Promise<Ubicacion> | null>(null);

  const docLimpio = soloDigitos(documento);
  const problema = problemaNombre(nombre) ?? problemaCedula(documento) ?? (!cargo.trim() ? "Escoge en calidad de qué firmas." : null);
  const listo = !problema && leido;

  function aFirmar() {
    setError(null);
    if (problema) return setError(problema);
    if (!leido) return setError("Marca que leíste el acta.");
    ubicacion.current = obtenerUbicacion();
    setFirmando(true);
  }

  async function guardarFirma(png: Blob) {
    setFirmando(false);
    setGuardando(true);
    setError(null);
    try {
      const r = await registrarFirmaEnLinea(
        supabase,
        { formatoId, rol: "sst_cliente", nombre: nombre.trim(), documento: docLimpio, cargo: cargo.trim() || null, empresa: empresa.trim() || null },
        png,
        await (ubicacion.current ?? obtenerUbicacion()),
      );
      if (!r.ok) throw new Error(r.error);
      setFirmo(true);
      // Si con esta firma el acta se selló (cierre automático), ya no está «por firmar»: va al documento
      // firmado. Si todavía falta la de Servielectro, se queda aquí con el aviso de abajo.
      const { data: pub } = await supabase.from("v_cliente_documentos").select("id").eq("formato_id", formatoId).limit(1);
      if (pub?.length) router.replace(`/cliente/documentos/formato/${formatoId}?firmado=1`);
      else router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  }

  if (firmando) {
    return <FirmaPantallaCompleta titulo={`${nombre.trim()} · CC ${docLimpio} · Contratante`} onListo={(png) => void guardarFirma(png)} onCancelar={() => setFirmando(false)} />;
  }

  if (firmo) {
    return (
      <div className="space-y-3">
        <p className="rounded-xl bg-green-50 px-4 py-3 text-lg font-semibold text-green-900">
          ✓ Firmaste esta acta como contratante. Ya quedó registrado. Falta la firma de Servielectro: cuando firme, el acta se cierra y te aparece en «Documentos».
        </p>
        <Link href="/cliente/firmas" className={`${BOTON} border-2 border-slate-900 text-slate-900`}>
          Volver a documentos por firmar
        </Link>
      </div>
    );
  }

  return (
    <section className="space-y-3 rounded-xl border-2 border-slate-900 bg-white p-4">
      <h2 className="text-lg font-bold">Firmar como contratante</h2>
      {error && (
        <div role="alert" className="rounded-xl border-4 border-red-600 bg-red-50 px-4 py-3 text-red-900">
          <p className="text-lg font-bold">✗ No quedó firmada</p>
          <p className="text-base">{error}</p>
        </div>
      )}
      <p className="text-sm text-slate-600">Escribe los datos de la <b>persona</b> que firma hoy (tú), no los del conjunto.</p>
      <label className="block">
        <span className="text-sm text-slate-600">Nombre y apellido de quien firma</span>
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="name" placeholder="Ej.: Argemiro Velandia" className={CAMPO} />
        {nombre.trim() && problemaNombre(nombre) && <span className="mt-0.5 block text-sm text-red-700">{problemaNombre(nombre)}</span>}
      </label>
      <label className="block">
        <span className="text-sm text-slate-600">Cédula de quien firma</span>
        <input value={documento} onChange={(e) => setDocumento(e.target.value)} inputMode="numeric" autoComplete="off" placeholder="Solo números" className={CAMPO} />
        {documento.trim() && problemaCedula(documento) && <span className="mt-0.5 block text-sm text-red-700">{problemaCedula(documento)}</span>}
      </label>
      <label className="block">
        <span className="text-sm text-slate-600">En calidad de</span>
        <select value={calidades.includes(cargo) || !cargo ? cargo : "__otro"} onChange={(e) => setCargo(e.target.value === "__otro" ? " " : e.target.value)} className={CAMPO}>
          <option value="">— Escoge —</option>
          {calidades.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
          <option value="__otro">Otra…</option>
        </select>
        {cargo && !calidades.includes(cargo) && (
          <input value={cargo.trimStart()} onChange={(e) => setCargo(e.target.value)} placeholder="¿En calidad de qué?" className={`${CAMPO} mt-2`} />
        )}
      </label>
      <label className="block">
        <span className="text-sm text-slate-600">Entidad que representa</span>
        <input value={empresa} onChange={(e) => setEmpresa(e.target.value)} placeholder="Conjunto, edificio o empresa" className={CAMPO} />
      </label>
      <label className="flex min-h-12 items-start gap-3 text-base">
        <input type="checkbox" checked={leido} onChange={(e) => setLeido(e.target.checked)} className="mt-1 h-6 w-6 shrink-0" />
        <span>Leí el acta completa y firmo en nombre del contratante.</span>
      </label>
      <button type="button" onClick={aFirmar} disabled={guardando || !listo} className={`${BOTON} bg-slate-900 text-white disabled:bg-slate-300`}>
        {guardando ? "Guardando…" : "Firmar"}
      </button>
      <p className="text-xs text-slate-500">
        Firma manuscrita digitalizada: queda registrada la hora, el equipo y la huella del contenido que firmaste. Si algo del acta no corresponde, no firmes y comunícate con Servielectro.
      </p>
    </section>
  );
}
