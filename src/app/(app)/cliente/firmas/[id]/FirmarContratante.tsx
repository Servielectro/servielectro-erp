"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { FirmaPantallaCompleta } from "@/app/(campo)/tecnico/FirmaPantallaCompleta";
import { obtenerUbicacion } from "@/lib/tecnico/captura";
import type { Ubicacion } from "@/lib/tecnico/db";
import { registrarFirmaEnLinea } from "@/lib/sst/firmar-en-linea";

const BOTON = "flex min-h-14 w-full items-center justify-center rounded-xl px-4 text-lg font-bold";
const CAMPO = "mt-0.5 w-full min-h-12 rounded-lg border border-slate-300 bg-white px-3 text-base";

/**
 * El contratante firma el acta (rol sst_cliente), con la MISMA firma a pantalla completa y el mismo
 * registro que usa el técnico: imagen en sgsst/formatos/{id}/firma-{uuid}.png con su huella, hora
 * del dispositivo, GPS si lo da, y la huella del contenido la pone la base. Escribe su nombre y
 * cédula: es su firma, no se toma de otro lado (se precarga lo de su propio perfil, si lo hay).
 */
export function FirmarContratante({
  formatoId,
  yaFirmo,
  inicial,
}: {
  formatoId: string;
  yaFirmo: boolean;
  inicial: { nombre: string; documento: string; cargo: string };
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [firmo, setFirmo] = useState(yaFirmo);
  const [nombre, setNombre] = useState(inicial.nombre);
  const [documento, setDocumento] = useState(inicial.documento);
  const [cargo, setCargo] = useState(inicial.cargo);
  const [empresa, setEmpresa] = useState("");
  const [leido, setLeido] = useState(false);
  const [firmando, setFirmando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ubicacion = useRef<Promise<Ubicacion> | null>(null);

  const docLimpio = documento.replace(/[^0-9A-Za-z]/g, "");
  const listo = nombre.trim().length > 2 && docLimpio.length >= 5 && leido;

  function aFirmar() {
    setError(null);
    if (!nombre.trim()) return setError("Escribe tu nombre completo.");
    if (docLimpio.length < 5) return setError("Escribe tu número de cédula.");
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
      router.refresh();
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
        <p className="rounded-xl bg-green-50 px-4 py-3 text-lg font-semibold text-green-900">✓ Firmaste esta acta como contratante. Ya quedó registrado.</p>
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
      <label className="block">
        <span className="text-sm text-slate-600">Nombre completo</span>
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="name" className={CAMPO} />
      </label>
      <label className="block">
        <span className="text-sm text-slate-600">Cédula</span>
        <input value={documento} onChange={(e) => setDocumento(e.target.value)} inputMode="numeric" className={CAMPO} />
      </label>
      <label className="block">
        <span className="text-sm text-slate-600">Cargo (por ejemplo: Administrador)</span>
        <input value={cargo} onChange={(e) => setCargo(e.target.value)} className={CAMPO} />
      </label>
      <label className="block">
        <span className="text-sm text-slate-600">Entidad que representa (opcional)</span>
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
