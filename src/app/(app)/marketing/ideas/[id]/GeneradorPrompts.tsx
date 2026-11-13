"use client";
/* eslint-disable @next/next/no-img-element -- enlaces firmados y temporales del bucket privado */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { nombreLimpio, sha256Archivo } from "@/lib/documentos/catalogo";
import { LINEAS_NEGOCIO, lineaSugerida } from "@/lib/marketing-prompt";
import { generarPromptsImagen } from "./acciones";
import type { MaterialBiblioteca, Pieza } from "./IdeaDetalle";

const ACEPTA = "image/jpeg,image/png,image/webp";
const LIMITE = 50 * 1024 * 1024;

/** Prompts de imagen de la idea: se redactan aquí, se copian a Gemini y la imagen vuelve a su pieza. */
export function GeneradorPrompts({
  escribe,
  ideaId,
  textoIdea,
  sucia,
  bloqueantes,
  piezas,
  biblioteca,
}: {
  escribe: boolean;
  ideaId: string;
  textoIdea: string;
  sucia: boolean;
  bloqueantes: string[];
  piezas: Pieza[];
  biblioteca: MaterialBiblioteca[];
}) {
  const router = useRouter();
  const [linea, setLinea] = useState<string>(() => lineaSugerida(textoIdea));
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  const bloqueada = bloqueantes.length > 0;
  const sinImagen = piezas.filter((p) => !p.path && !p.biblioteca_id).length;

  const generar = () => {
    if (sinImagen > 0 && !window.confirm("Se reemplazan los prompts que todavía no tienen imagen. ¿Seguir?")) return;
    empezar(async () => {
      setError(null);
      setAviso(null);
      const r = await generarPromptsImagen(ideaId, linea);
      if (!r.ok) return setError(r.error);
      setAviso(r.cuantas === 1 ? "Prompt listo." : `${r.cuantas} prompts listos, uno por lámina.`);
      router.refresh();
    });
  };

  return (
    <section className="space-y-3 rounded-lg border border-slate-300 bg-white p-3">
      <div>
        <h2 className="text-sm font-bold text-slate-900">Imágenes con IA</h2>
        <p className="text-sm text-slate-600">Sale del gancho, el guion y la línea de negocio. Se copia a Gemini (Nano Banana) y la imagen se sube aquí mismo.</p>
      </div>

      {bloqueada && (
        <p className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">
          <b>Bloqueado.</b> Esta idea usa material en el que se reconoce al cliente, sin autorización registrada: {bloqueantes.join(", ")}. Mientras siga ahí no se generan prompts, no se copian ni se suben imágenes.
        </p>
      )}

      {escribe && !bloqueada && (
        <div className="space-y-2">
          <label className="block text-sm font-semibold text-slate-800">
            Línea de negocio
            <select value={linea} onChange={(e) => setLinea(e.target.value)} className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-2 text-base font-normal">
              <option value="">Elige la línea</option>
              {LINEAS_NEGOCIO.map((l) => (
                <option key={l.key} value={l.key}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
          <button type="button" disabled={pendiente || !linea || sucia} onClick={generar} className="min-h-11 w-full rounded-lg bg-slate-900 text-sm font-semibold text-white disabled:opacity-40">
            {pendiente ? "Redactando…" : sucia ? "Guarda los cambios para generar" : piezas.length ? "Volver a generar prompts" : "Generar prompts de imagen"}
          </button>
        </div>
      )}

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
      {aviso && <p className="text-sm text-green-800">{aviso}</p>}

      <ul className="space-y-3">
        {piezas.map((p, i) => (
          <TarjetaPrompt key={p.id} pieza={p} numero={i + 1} escribe={escribe} bloqueada={bloqueada} material={biblioteca.find((b) => b.id === p.biblioteca_id)} />
        ))}
      </ul>
    </section>
  );
}

function TarjetaPrompt({ pieza, numero, escribe, bloqueada, material }: { pieza: Pieza; numero: number; escribe: boolean; bloqueada: boolean; material: MaterialBiblioteca | undefined }) {
  const router = useRouter();
  const [copiado, setCopiado] = useState<"en" | "es" | null>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  // Sin respuesta por defecto: hay que mirar la imagen. La IA a veces inventa letreros y placas.
  const [identifica, setIdentifica] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  const tieneImagen = !!(pieza.path || pieza.biblioteca_id);

  const copiar = async (cual: "en" | "es", texto: string) => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(cual);
      setTimeout(() => setCopiado(null), 2000);
    } catch {
      setError("El navegador no dejó copiar: selecciona el texto a mano.");
    }
  };

  const subir = () =>
    empezar(async () => {
      setError(null);
      if (!archivo || identifica !== false || bloqueada) return;
      if (archivo.size > LIMITE) return setError("El archivo pasa de 50 MB.");
      const supabase = createClient();
      const path = `generadas/${crypto.randomUUID()}-${nombreLimpio(archivo.name)}`;
      const s = await supabase.storage.from("marketing").upload(path, archivo, { contentType: archivo.type, upsert: false });
      if (s.error) return setError(`No se subió la imagen: ${s.error.message}`);
      // Con fila en la biblioteca, no solo el path: el candado de aprobación mira biblioteca_id.
      const bibliotecaId = crypto.randomUUID();
      const { error: e1 } = await supabase.from("marketing_biblioteca").insert({
        id: bibliotecaId,
        tipo: "foto",
        titulo: `Imagen generada con IA · pieza ${numero}`,
        path,
        bytes: archivo.size,
        sha256: await sha256Archivo(archivo),
        etiquetas: ["generada_ia", "nano_banana"],
        identificable: false,
        autorizacion: "no_aplica",
      });
      if (e1) return setError(`La imagen subió pero no quedó registrada: ${e1.message}`);
      const { data, error: e2 } = await supabase.from("marketing_piezas").update({ path, biblioteca_id: bibliotecaId }).eq("id", pieza.id).select("id");
      if (e2 || !data?.length) return setError(`La imagen quedó en la biblioteca, pero no se ató a esta pieza: ${e2?.message ?? "sin permiso"}`);
      setArchivo(null);
      setIdentifica(null);
      router.refresh();
    });

  const quitar = () => {
    if (!window.confirm(tieneImagen ? "¿Quitar este prompt y su imagen de la idea? La imagen sigue en la biblioteca." : "¿Quitar este prompt?")) return;
    empezar(async () => {
      setError(null);
      const { data, error: e } = await createClient().from("marketing_piezas").delete().eq("id", pieza.id).select("id");
      if (e || !data?.length) return setError(e?.message ?? "No se quitó (sin permiso).");
      router.refresh();
    });
  };

  return (
    <li className="space-y-2 rounded-lg border border-slate-200 p-2">
      <p className="text-sm font-bold text-slate-900">Pieza {numero}</p>
      {material?.url && <img src={material.url} alt={`Imagen de la pieza ${numero}`} className="w-full max-w-xs rounded-lg border border-slate-200" />}

      <div>
        <p className="text-xs font-semibold text-slate-600">Lo que se va a mandar, en español</p>
        <p className="whitespace-pre-wrap rounded-md bg-slate-50 p-2 text-sm text-slate-800">{pieza.texto}</p>
      </div>
      <div>
        <p className="text-xs font-semibold text-slate-600">Prompt en inglés (el que se pega en Gemini)</p>
        <p className="whitespace-pre-wrap rounded-md bg-slate-50 p-2 text-sm text-slate-800">{pieza.prompt}</p>
      </div>

      {!bloqueada && (
        <div className="grid gap-2 sm:grid-cols-2">
          <button type="button" onClick={() => copiar("en", pieza.prompt ?? "")} className="min-h-11 rounded-lg bg-brand-red text-sm font-semibold text-white">
            {copiado === "en" ? "Copiado ✓" : "Copiar prompt en inglés"}
          </button>
          <button type="button" onClick={() => copiar("es", pieza.texto ?? "")} className="min-h-11 rounded-lg border border-slate-300 text-sm">
            {copiado === "es" ? "Copiado ✓" : "Copiar en español"}
          </button>
        </div>
      )}

      {escribe && !bloqueada && !tieneImagen && (
        <div className="space-y-2 rounded-lg bg-slate-50 p-2">
          <p className="text-sm font-semibold text-slate-800">Subir la imagen que salió de Gemini</p>
          <input type="file" accept={ACEPTA} onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} className="block min-h-11 w-full text-sm" />
          {archivo && (
            <fieldset className={`rounded-lg border-2 p-2 ${identifica === null ? "border-amber-400 bg-amber-50" : "border-slate-200"}`}>
              <legend className="px-1 text-sm font-bold text-slate-900">Mira la imagen: ¿identifica un lugar, una marca o una persona? (obligatorio)</legend>
              <p className="mb-2 text-xs text-slate-700">Fachada o portería reconocible, letreros, direcciones, placas legibles, logos o marcas en los equipos, rostros, o se ve cómo está dispuesto un perímetro.</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-2 text-sm ${identifica === true ? "border-red-500 bg-red-50 font-semibold" : "border-slate-300 bg-white"}`}>
                  <input type="radio" name={`identifica-${pieza.id}`} checked={identifica === true} onChange={() => setIdentifica(true)} className="h-5 w-5" />
                  Sí, o no estoy seguro
                </label>
                <label className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-2 text-sm ${identifica === false ? "border-slate-700 bg-slate-100 font-semibold" : "border-slate-300 bg-white"}`}>
                  <input type="radio" name={`identifica-${pieza.id}`} checked={identifica === false} onChange={() => setIdentifica(false)} className="h-5 w-5" />
                  No, la revisé y no hay nada de eso
                </label>
              </div>
              {identifica === true && (
                <p className="mt-2 text-sm font-semibold text-red-800">Bloqueado: esta imagen no se sube. Pídele a Gemini otra versión sin eso. Si es una foto real de un cliente que autorizó, va por la biblioteca, con su autorización registrada.</p>
              )}
            </fieldset>
          )}
          <button type="button" disabled={pendiente || !archivo || identifica !== false} onClick={subir} className="min-h-11 w-full rounded-lg bg-slate-900 text-sm font-semibold text-white disabled:opacity-40">
            {pendiente ? "Subiendo…" : "Subir y atar a esta pieza"}
          </button>
        </div>
      )}

      {escribe && (
        <button type="button" disabled={pendiente} onClick={quitar} className="min-h-11 w-full rounded-lg border border-slate-300 text-sm text-slate-600">
          Quitar
        </button>
      )}
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
    </li>
  );
}
