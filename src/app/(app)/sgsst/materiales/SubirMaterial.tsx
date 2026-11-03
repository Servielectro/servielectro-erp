"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { VisorPdf } from "@/components/sst/VisorPdf";
import { sha256 } from "@/lib/tecnico/captura";
import { BUCKET_MATERIALES, urlFirmada } from "@/lib/sst/materiales";

const CAMPO = "mt-1 block w-full rounded-lg border border-slate-300 px-3 py-3 text-base";
const LIMITE = 15 * 1024 * 1024; // el del bucket sgsst (migración 75)

/**
 * Subir un material (PDF). La versión la pone la base (la siguiente del código); con "publicar",
 * la publicada anterior del mismo código queda archivada. El archivo va a
 * materiales/{codigo}/v{n}.pdf y fn_sst_material_registrar comprueba que esté y pese lo mismo.
 */
export function SubirMaterial({ codigosExigidos }: { codigosExigidos: string[] }) {
  const router = useRouter();
  const [codigo, setCodigo] = useState(codigosExigidos[0] ?? "");
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [minutos, setMinutos] = useState("");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [publicar, setPublicar] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState<string | null>(null);

  async function subir() {
    setError(null);
    setAviso(null);
    const cod = codigo.trim().toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9_-]{0,39}$/.test(cod)) return setError("El código solo lleva letras, números, guion y guion bajo (ej. IND-SGSST).");
    if (!nombre.trim()) return setError("Falta el nombre.");
    if (!archivo) return setError("Falta elegir el PDF.");
    if (archivo.type !== "application/pdf" && !/\.pdf$/i.test(archivo.name)) return setError("Por ahora solo PDF.");
    if (archivo.size > LIMITE) return setError("El archivo pasa de 15 MB.");
    const min = minutos.trim() ? Number(minutos) : null;
    if (min !== null && (!Number.isInteger(min) || min <= 0)) return setError("Los minutos de lectura van en número entero.");

    const supabase = createClient();
    try {
      setSubiendo("Calculando la huella del archivo…");
      const huella = await sha256(archivo);
      const { data: ultima } = await supabase.from("sst_materiales").select("version").eq("codigo", cod).order("version", { ascending: false }).limit(1).maybeSingle();
      const version = ((ultima as { version: number } | null)?.version ?? 0) + 1;
      const path = `materiales/${cod}/v${version}.pdf`;
      setSubiendo(`Subiendo ${(archivo.size / 1024 / 1024).toFixed(1)} MB…`);
      const subida = await supabase.storage.from(BUCKET_MATERIALES).upload(path, archivo, { contentType: "application/pdf", upsert: false });
      // Si quedó de un intento anterior, la base comprueba que pese lo mismo.
      if (subida.error && !/exists|duplicate/i.test(subida.error.message)) throw new Error(`No se pudo subir: ${subida.error.message}`);
      setSubiendo("Registrando…");
      const { error } = await supabase.rpc("fn_sst_material_registrar", {
        p_codigo: cod,
        p_nombre: nombre.trim(),
        p_descripcion: descripcion.trim() || null,
        p_path: path,
        p_nombre_archivo: archivo.name.replace(/\.[^.]*$/, "") + ".pdf",
        p_mime: "application/pdf",
        p_bytes: archivo.size,
        p_sha256: huella,
        p_minutos_lectura: min,
        p_publicar: publicar,
      });
      if (error) throw new Error(error.message);
      setAviso(`✓ ${cod} versión ${version} ${publicar ? "publicada" : "guardada como borrador"}.`);
      setNombre("");
      setDescripcion("");
      setMinutos("");
      setArchivo(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubiendo(null);
    }
  }

  return (
    <section className="space-y-3 rounded-2xl border-2 border-slate-900 p-4">
      <h2 className="text-base font-bold text-slate-900">Subir material</h2>
      <label className="block text-sm font-medium text-slate-900">
        Código <span className="text-red-700">*</span>
        <input value={codigo} onChange={(e) => setCodigo(e.target.value.toUpperCase())} placeholder="IND-SGSST" autoCapitalize="characters" className={CAMPO} />
        <span className="text-xs font-normal text-slate-500">Con un código que ya existe, sube la versión siguiente.</span>
      </label>
      <label className="block text-sm font-medium text-slate-900">
        Nombre <span className="text-red-700">*</span>
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Inducción y reinducción SG-SST 2026" className={CAMPO} />
      </label>
      <label className="block text-sm font-medium text-slate-900">
        Descripción
        <textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} rows={2} className={CAMPO} />
      </label>
      <label className="block text-sm font-medium text-slate-900">
        Minutos de lectura
        <input value={minutos} onChange={(e) => setMinutos(e.target.value)} inputMode="numeric" placeholder="10" className={CAMPO} />
      </label>
      <label className="flex min-h-14 cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-slate-400 px-3 text-center text-base">
        {archivo ? `📄 ${archivo.name} (${(archivo.size / 1024 / 1024).toFixed(1)} MB)` : "📄 Elegir el PDF"}
        <input type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} />
      </label>
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input type="checkbox" checked={publicar} onChange={(e) => setPublicar(e.target.checked)} className="h-5 w-5" />
        Publicar ya (reemplaza a la versión publicada de este código)
      </label>
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
      {aviso && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm font-semibold text-green-900">{aviso}</p>}
      <button type="button" onClick={subir} disabled={!!subiendo} className="min-h-14 w-full rounded-xl bg-slate-900 px-4 text-lg font-semibold text-white disabled:bg-slate-400">
        {subiendo ?? "Subir"}
      </button>
    </section>
  );
}

/** Ver el PDF (sin acuse: aquí se revisa, no se capacita), publicar un borrador o archivar. */
export function AccionesMaterial({ id, path, estado, nombre, puedeCambiar }: { id: string; path: string; estado: string; nombre: string; puedeCambiar: boolean }) {
  const router = useRouter();
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function ver() {
    setError(null);
    try {
      setUrl(await urlFirmada(createClient(), path));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function cambiar(nuevo: "publicado" | "archivado") {
    setError(null);
    let motivo: string | null = null;
    if (nuevo === "archivado") {
      motivo = prompt("¿Por qué se archiva?");
      if (!motivo?.trim()) return;
    } else if (!confirm("¿Publicar? La versión publicada de este código queda archivada.")) return;
    setOcupado(true);
    const { error } = await createClient().rpc("fn_sst_material_estado", { p_id: id, p_estado: nuevo, p_motivo: motivo });
    setOcupado(false);
    if (error) return setError(error.message);
    router.refresh();
  }

  if (url) return <VisorPdf url={url} titulo={nombre} onCerrar={() => setUrl(null)} />;
  return (
    <div className="mt-2 space-y-2">
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={ver} className="min-h-11 rounded-lg border border-slate-400 px-3 text-sm font-semibold">
          📖 Ver
        </button>
        {puedeCambiar && estado === "borrador" && (
          <button type="button" disabled={ocupado} onClick={() => void cambiar("publicado")} className="min-h-11 rounded-lg bg-green-700 px-3 text-sm font-semibold text-white">
            Publicar
          </button>
        )}
        {puedeCambiar && estado !== "archivado" && (
          <button type="button" disabled={ocupado} onClick={() => void cambiar("archivado")} className="min-h-11 rounded-lg border border-slate-400 px-3 text-sm">
            Archivar
          </button>
        )}
      </div>
      {error && <p className="text-sm text-red-800">{error}</p>}
    </div>
  );
}
