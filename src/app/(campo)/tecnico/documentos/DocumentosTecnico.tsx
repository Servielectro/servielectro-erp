"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { AbrirArchivo } from "@/components/rrhh/archivos";
import { TARJETA } from "@/components/rrhh/PantallaPerfil";
import { FirmaPantallaCompleta } from "../FirmaPantallaCompleta";
import { BUCKET_SOPORTES, TIPO_DOCUMENTO, fechaCorta, type DocumentoPersonal } from "@/lib/rrhh-registros";

export function DocumentosTecnico({ yo, documentos }: { yo: string; documentos: DocumentoPersonal[] }) {
  const router = useRouter();
  const [firmando, setFirmando] = useState<DocumentoPersonal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();

  // "Visto" una sola vez (la hora la pone la base): RRHH sabe que ya lo abrió.
  const marcarVisto = (d: DocumentoPersonal) => {
    if (d.visto_en) return;
    createClient().from("documentos_personal").update({ visto_en: new Date().toISOString() }).eq("id", d.id).is("visto_en", null).then(() => router.refresh());
  };

  function firmar(d: DocumentoPersonal, png: Blob) {
    setFirmando(null);
    setError(null);
    empezar(async () => {
      const supabase = createClient();
      // La base solo acepta la firma en documentos/{yo}/firmas/{documento}.png, de un documento
      // propio que la pide y no está firmado.
      const path = `documentos/${yo}/firmas/${d.id}.png`;
      const { error: e1 } = await supabase.storage.from(BUCKET_SOPORTES).upload(path, png, { contentType: "image/png", upsert: false });
      if (e1 && !/exists|duplicate/i.test(e1.message)) return setError(`No se pudo subir la firma: ${e1.message}`);
      const { error: e2 } = await supabase.from("documentos_personal").update({ firma_path: path }).eq("id", d.id);
      if (e2) return setError(e2.message);
      setAviso("Documento firmado.");
      router.refresh();
    });
  }

  if (firmando) {
    return <FirmaPantallaCompleta titulo={`Firma: ${firmando.titulo}`} onCancelar={() => setFirmando(null)} onListo={(png) => firmar(firmando, png)} />;
  }

  return (
    <div className="space-y-3">
      {aviso && <p className="rounded-lg bg-slate-800 px-3 py-2 text-sm text-white">{aviso}</p>}
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
      {documentos.length === 0 ? (
        <p className="text-sm text-slate-500">Todavía no tienes documentos. Cuando RRHH suba tu desprendible, te aparece acá.</p>
      ) : (
        <ul className="space-y-2">
          {documentos.map((d) => {
            const porFirmar = d.requiere_firma && !d.firmado_en;
            return (
              <li key={d.id} className={`${TARJETA} ${porFirmar ? "border-amber-400" : ""}`}>
                <p className="text-base font-semibold">{d.titulo}</p>
                <p className="text-sm text-slate-600">
                  {TIPO_DOCUMENTO[d.tipo]}
                  {d.periodo_inicio ? ` · ${fechaCorta(d.periodo_inicio)} → ${fechaCorta(d.periodo_fin)}` : ""}
                  {` · subido el ${fechaCorta(d.subido_en)}`}
                </p>
                {d.firmado_en && <p className="text-sm text-green-700">Firmado el {fechaCorta(d.firmado_en)}</p>}
                {porFirmar && <p className="text-sm font-semibold text-amber-800">RRHH necesita tu firma en este documento.</p>}
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <AbrirArchivo
                    path={d.storage_path}
                    onAbierto={() => marcarVisto(d)}
                    className="min-h-9 rounded-lg border border-slate-400 text-sm font-semibold disabled:opacity-40"
                  >
                    Ver
                  </AbrirArchivo>
                  <AbrirArchivo
                    path={d.storage_path}
                    descargar={d.nombre_archivo ?? `${d.titulo}.pdf`}
                    onAbierto={() => marcarVisto(d)}
                    className="min-h-9 rounded-lg border border-slate-400 text-sm font-semibold disabled:opacity-40"
                  >
                    Descargar
                  </AbrirArchivo>
                </div>
                {porFirmar && (
                  <button
                    type="button"
                    disabled={pendiente}
                    onClick={() => setFirmando(d)}
                    className="mt-2 min-h-11 w-full rounded-lg bg-slate-900 text-base font-semibold text-white disabled:opacity-40"
                  >
                    ✍️ Firmar
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
