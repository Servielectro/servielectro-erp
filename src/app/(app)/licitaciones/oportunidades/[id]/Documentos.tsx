"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { EXTENSIONES_PERMITIDAS, TIPOS_DOCUMENTO, nombreComparable, tipoPorNombre } from "@/lib/licitaciones/etapas";
import { sha256 } from "@/lib/tecnico/captura";
import { traerDocumentosSecop } from "./acciones";

export interface Documento {
  id: string;
  tipo: string;
  tipo_deducido: boolean;
  nombre_original: string;
  url_origen: string | null;
  extension: string | null;
  tamano_secop: number | null;
  cargado_en_secop: string | null;
  secop_contrato: string | null;
  secop_id_documento: number | null;
  path: string | null;
  sha256: string | null;
  notas: string | null;
}

interface Subida {
  nombre: string;
  estado: "esperando" | "subiendo" | "ok" | "repetido" | "error";
  detalle?: string;
}

const BUCKET = "licitaciones";
const LIMITE = 100 * 1024 * 1024; // el del bucket (migración 143)
// Orden en que se leen: primero lo que trae las reglas.
const ORDEN = ["pliego", "invitacion", "estudios_previos", "anexo_tecnico", "matriz_riesgos", "adenda", "aviso_convocatoria", "formulario", "otro", "ejecucion"];
const DE_REGLAS = new Set(["pliego", "invitacion", "estudios_previos", "anexo_tecnico", "matriz_riesgos", "adenda"]);

const tamano = (b: number | null) => (b == null ? "" : b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const extensionDe = (nombre: string) => (/\.([^.]+)$/.exec(nombre)?.[1] ?? "").toLowerCase();

/**
 * Los documentos del proceso. La lista viene de Datos Abiertos (dmgg-8hin). Los archivos NO se bajan
 * solos: el portal de SECOP lo impide y eso no se rodea (ver acciones.ts). La persona los abre en
 * SECOP, los guarda y los arrastra aquí; cada uno se empareja con su renglón por nombre y tamaño,
 * y la lista dice cuáles faltan.
 *
 * El tipo es una deducción del nombre mientras tipo_deducido sea true, y se ve como tal. El motor de
 * análisis no debe darlo por cierto: un anexo leído como pliego inventa requisitos.
 */
export function Documentos({
  licitacionId,
  documentos,
  puedeTraer,
  puedeEditar,
  puedeSubir,
}: {
  licitacionId: string;
  documentos: Documento[];
  puedeTraer: boolean;
  puedeEditar: boolean;
  puedeSubir: boolean;
}) {
  const router = useRouter();
  const entrada = useRef<HTMLInputElement>(null);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [arrastrando, setArrastrando] = useState(false);
  const [subidas, setSubidas] = useState<Subida[]>([]);
  const [soloFaltan, setSoloFaltan] = useState(false);

  async function traer() {
    setOcupado(true);
    setError(null);
    setAviso(null);
    const r = await traerDocumentosSecop(licitacionId);
    setOcupado(false);
    if (!r.ok) return setError(r.error);
    setAviso(
      r.encontrados === 0
        ? "SECOP todavía no publica documentos de este proceso en Datos Abiertos (va 1 a 3 días atrás). Ábralo en SECOP II."
        : `✓ ${r.encontrados} documentos en SECOP${r.nuevos ? `, ${r.nuevos} nuevos` : ", ninguno nuevo"}.`,
    );
    router.refresh();
  }

  async function corregirTipo(d: Documento, tipo: string) {
    setError(null);
    const { error } = await createClient().from("licitacion_documentos").update({ tipo, tipo_deducido: false }).eq("id", d.id);
    if (error) return setError(error.message);
    router.refresh();
  }

  async function verCopia(d: Documento) {
    if (!d.path) return;
    setError(null);
    // La ventana se abre antes del await: si no, el navegador la bloquea.
    const ventana = window.open("", "_blank");
    const { data, error } = await createClient().storage.from(BUCKET).createSignedUrl(d.path, 300);
    if (error || !data) {
      ventana?.close();
      return setError(`No se pudo abrir la copia: ${error?.message ?? ""}`);
    }
    if (ventana) ventana.location.href = data.signedUrl;
  }

  async function subir(archivos: File[]) {
    if (!archivos.length || ocupado) return;
    setError(null);
    setAviso(null);
    setOcupado(true);
    setSubidas(archivos.map((a) => ({ nombre: a.name, estado: "esperando" })));
    const marcar = (i: number, s: Partial<Subida>) => setSubidas((xs) => xs.map((x, j) => (j === i ? { ...x, ...s } : x)));
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setOcupado(false);
      return setError("La sesión se cerró: vuelva a entrar.");
    }

    const huellas = new Map(documentos.filter((d) => d.sha256).map((d) => [d.sha256!, d.nombre_original]));
    const tomados = new Set<string>();
    for (let i = 0; i < archivos.length; i++) {
      const a = archivos[i];
      const ext = extensionDe(a.name);
      if (!EXTENSIONES_PERMITIDAS.includes(ext)) {
        marcar(i, { estado: "error", detalle: `Tipo de archivo no admitido (.${ext || "sin extensión"}).` });
        continue;
      }
      if (a.size === 0) {
        marcar(i, { estado: "error", detalle: "El archivo está vacío." });
        continue;
      }
      if (a.size > LIMITE) {
        marcar(i, { estado: "error", detalle: "Pasa de 100 MB." });
        continue;
      }
      marcar(i, { estado: "subiendo", detalle: "Calculando la huella…" });
      try {
        const huella = await sha256(a);
        if (huellas.has(huella)) {
          marcar(i, { estado: "repetido", detalle: `Ya estaba, como «${huellas.get(huella)}».` });
          continue;
        }

        // ¿A qué renglón de SECOP corresponde? Por nombre (con el mismo peso, si lo hay) y, si lo
        // renombraron, por peso exacto cuando solo uno pendiente de esa extensión pesa eso.
        const pendientes = documentos.filter((d) => !d.path && !tomados.has(d.id));
        const comparable = nombreComparable(a.name);
        const porNombre = pendientes.filter((d) => nombreComparable(d.nombre_original) === comparable);
        const porPeso = pendientes.filter((d) => d.tamano_secop === a.size && (d.extension ?? "") === ext);
        const renglon = porNombre.find((d) => d.tamano_secop === a.size) ?? porNombre[0] ?? (porPeso.length === 1 ? porPeso[0] : undefined);

        marcar(i, { detalle: `Subiendo ${tamano(a.size)}…` });
        const path = `${licitacionId}/${huella}.${ext}`;
        const s = await supabase.storage.from(BUCKET).upload(path, a, { contentType: a.type || "application/octet-stream", upsert: false });
        // Si quedó de un intento anterior es el mismo archivo: la ruta lleva su huella.
        if (s.error && !/exists|duplicate/i.test(s.error.message)) throw new Error(s.error.message);

        const archivo = { path, sha256: huella, bytes: a.size, mime: a.type || null, bajado_en: new Date().toISOString(), bajado_por: user.id };
        // Sin .select(): la fila no se pide de vuelta (ver insert-sin-returning).
        const { error: e } = renglon
          ? await supabase.from("licitacion_documentos").update(archivo).eq("id", renglon.id)
          : await supabase.from("licitacion_documentos").insert({
              ...archivo,
              licitacion_id: licitacionId,
              nombre_original: a.name,
              extension: ext,
              tipo: tipoPorNombre(a.name),
              tipo_deducido: true,
            });
        if (e) {
          if (e.code === "23505") {
            marcar(i, { estado: "repetido", detalle: "Ese mismo archivo ya está en esta licitación." });
            continue;
          }
          throw new Error(e.message);
        }
        huellas.set(huella, a.name);
        if (renglon) tomados.add(renglon.id);
        marcar(i, {
          estado: "ok",
          detalle: !renglon
            ? "No está en la lista de SECOP: quedó como documento aparte."
            : renglon.tamano_secop != null && renglon.tamano_secop !== a.size
              ? `Es «${renglon.nombre_original}», pero pesa distinto de lo que dice SECOP: revise que sea el mismo.`
              : `Es «${renglon.nombre_original}».`,
        });
      } catch (e) {
        marcar(i, { estado: "error", detalle: e instanceof Error ? e.message : "No se pudo subir." });
      }
    }
    setOcupado(false);
    router.refresh();
  }

  // SECOP repite archivos (mismo nombre y tamaño con otro id): se muestran una vez, con la cuenta.
  const grupos = new Map<string, Documento[]>();
  for (const d of documentos) {
    const k = `${d.nombre_original}|${d.tamano_secop ?? ""}`;
    grupos.set(k, [...(grupos.get(k) ?? []), d]);
  }
  const unicos = [...grupos.values()].map((g) => ({ d: g.find((x) => x.path) ?? g[0], veces: g.length }));
  unicos.sort((a, b) => ORDEN.indexOf(a.d.tipo) - ORDEN.indexOf(b.d.tipo) || a.d.nombre_original.localeCompare(b.d.nombre_original, "es"));
  const faltan = unicos.filter((u) => !u.d.path);
  const faltanReglas = faltan.filter((u) => DE_REGLAS.has(u.d.tipo)).length;
  const visibles = soloFaltan ? faltan : unicos;

  return (
    <section className="rounded-lg border border-slate-300 bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-slate-900">Los pliegos y documentos</h2>
        {puedeTraer && (
          <button type="button" onClick={traer} disabled={ocupado} className="min-h-11 rounded-lg bg-brand-navy px-3 text-sm font-semibold text-white disabled:opacity-50">
            {documentos.length ? "Actualizar la lista de SECOP" : "Traer la lista de SECOP"}
          </button>
        )}
      </div>
      <p className="mt-1 text-xs text-slate-500">
        La lista viene de Datos Abiertos de SECOP II. Los archivos no se bajan solos: ábralos en SECOP{puedeSubir ? ", guárdelos y súbalos aquí" : ""}. SECOP no dice qué es cada
        archivo: el tipo marcado «deducido» es una suposición por el nombre, hasta que alguien lo confirme.
      </p>

      {puedeSubir && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setArrastrando(true);
          }}
          onDragLeave={() => setArrastrando(false)}
          onDrop={(e) => {
            e.preventDefault();
            setArrastrando(false);
            subir(Array.from(e.dataTransfer.files));
          }}
          className={`mt-2 rounded-lg border-2 border-dashed p-4 text-center ${arrastrando ? "border-brand-navy bg-slate-100" : "border-slate-300 bg-slate-50"}`}
        >
          <p className="text-sm text-slate-700">Arrastre aquí los archivos que bajó de SECOP (varios a la vez)</p>
          <button
            type="button"
            disabled={ocupado}
            onClick={() => entrada.current?.click()}
            className="mt-2 min-h-11 rounded-lg border border-brand-navy px-3 text-sm font-semibold text-brand-navy disabled:opacity-50"
          >
            {ocupado ? "Trabajando…" : "O elegirlos"}
          </button>
          <input
            ref={entrada}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              subir(Array.from(e.target.files ?? []));
              e.target.value = "";
            }}
          />
        </div>
      )}

      {subidas.length > 0 && (
        <ul className="mt-2 space-y-1">
          {subidas.map((s, i) => (
            <li
              key={i}
              className={`rounded px-2 py-1 text-xs ${
                s.estado === "ok" ? "bg-emerald-50 text-emerald-800" : s.estado === "error" ? "bg-red-50 text-red-800" : s.estado === "repetido" ? "bg-amber-50 text-amber-900" : "bg-slate-100 text-slate-700"
              }`}
            >
              <b className="break-words">{s.nombre}</b>
              {s.detalle ? ` — ${s.detalle}` : s.estado === "esperando" ? " — en espera" : ""}
            </li>
          ))}
        </ul>
      )}

      {error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
      {aviso && <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{aviso}</p>}

      {documentos.length === 0 ? (
        <p className="mt-2 text-sm text-slate-600">{puedeTraer ? "Aún no se ha traído la lista de documentos." : "Aún no hay documentos registrados."}</p>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className={`text-sm font-semibold ${faltan.length ? "text-amber-900" : "text-emerald-800"}`}>
              {faltan.length
                ? `Faltan ${faltan.length} de ${unicos.length} por subir${faltanReglas ? ` · ${faltanReglas} traen las reglas (pliego, invitación, estudios, anexos, matriz, adendas)` : ""}`
                : `✓ Los ${unicos.length} documentos están subidos`}
            </p>
            {faltan.length > 0 && faltan.length < unicos.length && (
              <label className="flex min-h-11 items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={soloFaltan} onChange={(e) => setSoloFaltan(e.target.checked)} />
                Solo los que faltan
              </label>
            )}
          </div>
          <ul className="mt-1 divide-y divide-slate-100">
            {visibles.map(({ d, veces }) => (
              <li key={d.id} className="flex flex-wrap items-center gap-2 py-2">
                <div className="min-w-0 flex-1">
                  <p className="break-words text-sm text-slate-900">
                    <span className={`mr-1 rounded px-1.5 py-0.5 text-xs font-semibold ${d.path ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}`}>
                      {d.path ? "✓ Subido" : "Falta subir"}
                    </span>
                    {d.nombre_original}
                  </p>
                  <p className="text-xs text-slate-500">
                    {[
                      d.extension?.toUpperCase(),
                      tamano(d.tamano_secop),
                      d.cargado_en_secop ? `en SECOP desde ${d.cargado_en_secop}` : d.secop_id_documento == null ? "subido a mano, no está en la lista de SECOP" : null,
                      veces > 1 ? `aparece ${veces} veces en SECOP` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                {puedeEditar ? (
                  <>
                    <select
                      aria-label="Tipo de documento"
                      value={d.tipo}
                      onChange={(e) => corregirTipo(d, e.target.value)}
                      className={`min-h-11 rounded-lg border px-2 text-sm ${d.tipo === "ejecucion" ? "border-red-300 text-red-800" : "border-slate-300"}`}
                      title={d.tipo_deducido ? "Deducido del nombre del archivo" : "Confirmado por una persona"}
                    >
                      {Object.entries(TIPOS_DOCUMENTO).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                          {k === d.tipo && d.tipo_deducido ? " (deducido)" : ""}
                        </option>
                      ))}
                    </select>
                    {d.tipo_deducido && (
                      <button type="button" onClick={() => corregirTipo(d, d.tipo)} className="min-h-11 rounded-lg border border-slate-300 px-2 text-xs text-slate-700">
                        Confirmar tipo
                      </button>
                    )}
                  </>
                ) : (
                  <span className="text-xs text-slate-600">
                    {TIPOS_DOCUMENTO[d.tipo] ?? d.tipo}
                    {d.tipo_deducido ? " (deducido)" : ""}
                  </span>
                )}
                {d.path && (
                  <button type="button" onClick={() => verCopia(d)} className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm text-brand-navy">
                    Ver copia
                  </button>
                )}
                {d.url_origen && (
                  <a href={d.url_origen} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 px-3 text-sm text-brand-navy">
                    Abrir en SECOP ↗
                  </a>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
