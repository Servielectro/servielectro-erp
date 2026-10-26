"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { AbrirArchivo } from "@/components/rrhh/archivos";
import { fechaCorta } from "@/lib/rrhh-registros";

const BUCKET = "documentos-clientes";

export interface RutDocumento {
  id: string;
  nombre_archivo: string;
  storage_path: string;
  estado: string;
  subido_en: string;
}

/**
 * El RUT del cliente (migración 71: también para Administrativo). Ver y subir; no se reemplaza
 * ni se borra: el nuevo queda encima y los anteriores siguen en la lista.
 */
export function RutCliente({ clienteId, ruts, sube }: { clienteId: string; ruts: RutDocumento[]; sube: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();

  function subir(archivo: File) {
    empezar(async () => {
      setError(null);
      const ext = archivo.name.toLowerCase().split(".").pop() ?? "";
      const mime = ext === "pdf" ? "application/pdf" : ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : ["jpg", "jpeg"].includes(ext) ? "image/jpeg" : null;
      if (!mime) return setError(`“${archivo.name}” no es un PDF ni una foto. Sube el RUT en PDF o como foto (JPG, PNG o WEBP).`);
      const supabase = createClient();
      const yo = (await supabase.auth.getUser()).data.user?.id ?? null;
      const nombre = archivo.name.replace(/[^\w.\-]+/g, "_");
      // La misma carpeta que usa la cotización (subirYLeerRut): clientes/{id}/rut/.
      const path = `clientes/${clienteId}/rut/${Date.now()}-${nombre}`;
      const { error: eSubida } = await supabase.storage.from(BUCKET).upload(path, archivo, { contentType: mime, upsert: false });
      if (eSubida) return setError(`No se pudo subir: ${eSubida.message}`);
      // Quien lo sube aquí lo revisa contra la ficha: queda como RUT vigente.
      const { error: eDoc } = await supabase.from("documentos").insert({
        tipo_documento: "RUT",
        cliente_id: clienteId,
        storage_path: path,
        nombre_archivo: archivo.name,
        subido_por: yo,
        estado: "CONFIRMADO",
        confirmado_por: yo,
        confirmado_en: new Date().toISOString(),
      });
      if (eDoc) return setError(`El archivo se subió pero no se pudo registrar: ${eDoc.message}`);
      router.refresh();
    });
  }

  const visibles = ruts.filter((r) => r.estado !== "DESCARTADO");
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-3 sm:p-4">
      <h2 className="mb-1 text-sm font-bold text-slate-900">RUT</h2>
      <p className="mb-2 text-xs text-slate-500">El documento de donde salen el NIT, el régimen y las responsabilidades. Revisa la ficha contra él.</p>
      {visibles.length === 0 ? (
        <p className="text-sm text-slate-500">No tiene RUT subido.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {visibles.map((r, i) => (
            <li key={r.id} className="flex flex-wrap items-center gap-x-2">
              <AbrirArchivo bucket={BUCKET} path={r.storage_path}>
                📎 {r.nombre_archivo}
              </AbrirArchivo>
              <span className="text-xs text-slate-500">
                subido el {fechaCorta(r.subido_en)}
                {i === 0 ? " · el más reciente" : ""}
                {r.estado === "PENDIENTE_CONFIRMACION" ? " · sin confirmar" : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
      {sube ? (
        <label className={`mt-2 flex min-h-11 cursor-pointer items-center justify-center rounded-lg border-2 border-slate-400 px-3 text-sm font-semibold ${pendiente ? "pointer-events-none opacity-40" : ""}`}>
          {pendiente ? "Subiendo…" : visibles.length ? "Subir un RUT más reciente" : "Subir el RUT (PDF o foto)"}
          <input
            type="file"
            accept="application/pdf,image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) subir(f);
            }}
          />
        </label>
      ) : (
        <p className="mt-2 text-xs text-slate-500">Subir el RUT requiere Administrativo o Comercial en nivel “trabajar”.</p>
      )}
      {error && <p className="mt-1 rounded-md bg-red-50 px-2 py-1 text-xs text-red-800">{error}</p>}
    </section>
  );
}
