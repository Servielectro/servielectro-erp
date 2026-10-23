"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { AbrirArchivo, ElegirArchivo, subirSoporte } from "@/components/rrhh/archivos";
import { TIPO_DOCUMENTO, TIPOS_DOCUMENTO, fechaCorta, type DocumentoPersonal, type TipoDocumento } from "@/lib/rrhh-registros";

const CAMPO = "mt-0.5 block w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm";

export function DocumentosRrhh({
  documentos,
  personas,
  personaFiltro,
}: {
  documentos: DocumentoPersonal[];
  personas: { id: string; nombre: string }[];
  personaFiltro: string;
}) {
  const router = useRouter();
  const nombre = Object.fromEntries(personas.map((p) => [p.id, p.nombre]));
  const [abierto, setAbierto] = useState(false);
  const [persona, setPersona] = useState(personaFiltro);
  const [tipo, setTipo] = useState<TipoDocumento>("desprendible");
  const [titulo, setTitulo] = useState("");
  const [inicio, setInicio] = useState("");
  const [fin, setFin] = useState("");
  const [requiereFirma, setRequiereFirma] = useState(false);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();

  const falta = !persona
    ? "Elige a quién va dirigido."
    : !titulo.trim()
      ? "Falta el título (lo ve la persona)."
      : inicio && fin && fin < inicio
        ? "El período termina antes de empezar."
        : !archivo
          ? "Falta el archivo."
          : null;

  function subir() {
    if (falta || !archivo) return;
    setError(null);
    empezar(async () => {
      try {
        // La carpeta es la de la persona: la base no deja registrar un documento de una persona
        // con el archivo en la carpeta de otra.
        const s = await subirSoporte(`documentos/${persona}`, archivo);
        const { error: e } = await createClient().from("documentos_personal").insert({
          persona_id: persona,
          tipo,
          titulo: titulo.trim(),
          periodo_inicio: inicio || null,
          periodo_fin: fin || null,
          storage_path: s.path,
          nombre_archivo: s.nombre,
          mime: s.mime,
          bytes: s.bytes,
          requiere_firma: requiereFirma,
        });
        if (e) throw new Error(e.message);
        setAviso(`Documento subido para ${nombre[persona] ?? "la persona"}. Ya le aparece en su perfil.`);
        setAbierto(false);
        setTitulo("");
        setArchivo(null);
        setRequiereFirma(false);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  }

  return (
    <div className="space-y-3">
      {abierto ? (
        <div className="space-y-2 rounded-lg border border-slate-300 bg-white p-3">
          <label className="block text-xs text-slate-600">
            Para quién *
            <select value={persona} onChange={(e) => setPersona(e.target.value)} className={CAMPO}>
              <option value="">Elegir persona…</option>
              {personas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-xs text-slate-600">
              Tipo
              <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoDocumento)} className={CAMPO}>
                {TIPOS_DOCUMENTO.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nombre}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs text-slate-600">
              Título *
              <input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ej. Desprendible 1.ª quincena octubre" className={CAMPO} />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-xs text-slate-600">
              Período desde (si aplica)
              <input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} className={CAMPO} />
            </label>
            <label className="block text-xs text-slate-600">
              Período hasta
              <input type="date" value={fin} min={inicio || undefined} onChange={(e) => setFin(e.target.value)} className={CAMPO} />
            </label>
          </div>
          <label className="flex min-h-9 items-center gap-2 text-sm">
            <input type="checkbox" checked={requiereFirma} onChange={(e) => setRequiereFirma(e.target.checked)} className="h-4 w-4" />
            Pedirle que lo firme
          </label>
          {archivo ? (
            <p className="flex items-center justify-between gap-2 text-sm">
              <span className="truncate">📎 {archivo.name}</span>
              <button type="button" onClick={() => setArchivo(null)} className="text-xs font-semibold underline">
                Quitar
              </button>
            </p>
          ) : (
            <ElegirArchivo onElegido={setArchivo} textoFoto="📷 Foto" textoArchivo="PDF o imagen" />
          )}
          {error && <p className="rounded-md bg-red-50 px-2 py-1 text-xs text-red-800">{error}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={() => setAbierto(false)} className="min-h-11 flex-1 rounded-md border border-slate-300 text-sm font-semibold">
              Cancelar
            </button>
            <button
              type="button"
              disabled={pendiente || falta !== null}
              onClick={subir}
              className="min-h-11 flex-1 rounded-md bg-slate-900 text-sm font-semibold text-white disabled:opacity-40"
            >
              {pendiente ? "Subiendo…" : "Subir documento"}
            </button>
          </div>
          {falta && !pendiente && <p className="text-center text-xs text-slate-500">{falta}</p>}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => {
            setAviso(null);
            setAbierto(true);
          }}
          className="min-h-11 w-full rounded-lg bg-slate-900 text-sm font-semibold text-white"
        >
          + Subir documento
        </button>
      )}
      {aviso && <p className="rounded-md bg-slate-800 px-3 py-2 text-xs text-white">{aviso}</p>}

      {documentos.length === 0 ? (
        <p className="text-sm text-slate-500">No hay documentos{personaFiltro ? " de esta persona" : ""}.</p>
      ) : (
        <ul className="space-y-2 lg:grid lg:grid-cols-2 lg:items-start lg:gap-2 lg:space-y-0">
          {documentos.map((d) => (
            <FilaDocumento key={d.id} d={d} persona={nombre[d.persona_id] ?? "—"} />
          ))}
        </ul>
      )}
    </div>
  );
}

function FilaDocumento({ d, persona }: { d: DocumentoPersonal; persona: string }) {
  const router = useRouter();
  const [anulando, setAnulando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  const anulado = !!d.anulado_en;

  return (
    <li className={`rounded-lg border border-slate-300 bg-white p-3 text-sm ${anulado ? "opacity-60" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-slate-900">{d.titulo}</p>
          <p className="text-xs text-slate-600">
            {persona} · {TIPO_DOCUMENTO[d.tipo]}
            {d.periodo_inicio ? ` · ${fechaCorta(d.periodo_inicio)} → ${fechaCorta(d.periodo_fin)}` : ""} · subido el {fechaCorta(d.subido_en)}
          </p>
        </div>
        <span className="shrink-0 text-right text-xs font-semibold text-slate-600">
          {anulado
            ? "Anulado"
            : d.requiere_firma
              ? d.firmado_en
                ? "Firmado"
                : d.visto_en
                  ? "Visto, sin firmar"
                  : "Sin ver"
              : d.visto_en
                ? "Visto"
                : "Sin ver"}
        </span>
      </div>
      {anulado && d.motivo_anulacion && <p className="mt-1 text-xs text-slate-600">Anulado: {d.motivo_anulacion}. La persona ya no lo ve.</p>}
      <div className="mt-1 flex flex-wrap gap-x-3 text-xs">
        <AbrirArchivo path={d.storage_path}>📎 Documento</AbrirArchivo>
        {d.firma_path && <AbrirArchivo path={d.firma_path}>✍️ Firma</AbrirArchivo>}
      </div>
      {!anulado &&
        (anulando ? (
          <div className="mt-2 space-y-1">
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={2}
              placeholder="Por qué se anula (ej. archivo equivocado)"
              className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
            />
            <div className="flex gap-2">
              <button type="button" onClick={() => setAnulando(false)} className="min-h-9 flex-1 rounded-md border border-slate-300 text-xs font-semibold">
                Cancelar
              </button>
              <button
                type="button"
                disabled={pendiente || !motivo.trim()}
                onClick={() =>
                  empezar(async () => {
                    setError(null);
                    const { error: e } = await createClient().from("documentos_personal").update({ motivo_anulacion: motivo.trim() }).eq("id", d.id);
                    if (e) return setError(e.message);
                    router.refresh();
                  })
                }
                className="min-h-9 flex-1 rounded-md bg-red-700 text-xs font-semibold text-white disabled:opacity-40"
              >
                Anular
              </button>
            </div>
            {!motivo.trim() && <p className="text-xs text-slate-500">Escribe por qué se anula.</p>}
          </div>
        ) : (
          <button type="button" onClick={() => setAnulando(true)} className="mt-2 min-h-9 rounded-md border border-red-300 px-3 text-xs font-semibold text-red-800">
            Anular…
          </button>
        ))}
      {error && <p className="mt-1 rounded-md bg-red-50 px-2 py-1 text-xs text-red-800">{error}</p>}
    </li>
  );
}
