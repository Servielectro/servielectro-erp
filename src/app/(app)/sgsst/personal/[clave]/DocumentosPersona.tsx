"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { AbrirArchivo } from "@/components/rrhh/archivos";
import { extension, MIME, nombreLimpio, sha256Archivo } from "@/lib/documentos/catalogo";
import {
  BUCKET_SST_PERSONAL,
  ENFASIS,
  EXAMENES,
  NIVELES_ALTURAS,
  nombreDe,
  NOMBRE_TIPO_DOC,
  RESULTADOS,
  SEMAFORO,
  semaforo,
  SUBSISTEMAS,
  TIPOS_DOC_PERSONA,
  vigenteDe,
  type DocPersona,
  type TipoDocPersona,
} from "@/lib/sst/personal";

const CAMPO = "mt-1 block w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm";
const ARCHIVO_OK = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic"]);

function resumen(d: DocPersona): string {
  switch (d.tipo) {
    case "aptitud_ocupacional":
      return `${nombreDe(EXAMENES, d.examen)} · ${nombreDe(RESULTADOS, d.resultado)}${d.enfasis.length ? ` · énfasis: ${d.enfasis.map((e) => nombreDe(ENFASIS, e)).join(", ")}` : ""}`;
    case "certificado_alturas":
      return nombreDe(NIVELES_ALTURAS, d.nivel);
    case "capacitacion":
      return `${d.tema ?? ""}${d.horas ? ` · ${d.horas} h` : ""}`;
    case "certificado_afiliacion":
      return nombreDe(SUBSISTEMAS, d.subsistema);
    default:
      return d.nombre ?? "";
  }
}

/**
 * Los documentos de una persona (migración 107): lo vigente de cada tipo con su semáforo, la
 * historia (nada se borra: se archiva con motivo) y el registro de uno nuevo. Cada área registra
 * lo suyo: lo médico, alturas y capacitaciones SG-SST; afiliaciones y otros también RRHH.
 */
export function DocumentosPersona({ clave, docs, sst, rrhh }: { clave: `e-${string}` | `c-${string}`; docs: DocPersona[]; sst: boolean; rrhh: boolean }) {
  const [registrando, setRegistrando] = useState(false);
  const puede = (t: (typeof TIPOS_DOC_PERSONA)[number]) => (t.sst ? sst : sst || rrhh);
  const tipos = TIPOS_DOC_PERSONA.filter(puede);
  const filas: { tipo: TipoDocPersona; titulo: string; sub?: string | null }[] = [
    { tipo: "aptitud_ocupacional", titulo: "Aptitud (examen médico)" },
    { tipo: "certificado_alturas", titulo: "Trabajo en alturas" },
    ...SUBSISTEMAS.map((s) => ({ tipo: "certificado_afiliacion" as TipoDocPersona, titulo: `Afiliación ${s.nombre}`, sub: s.id })),
  ];
  const historia = docs.filter((d) => d.tipo === "capacitacion" || d.tipo === "otro" || d.tipo === "historia_clinica");

  return (
    <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex-1 text-sm font-bold text-slate-900">Documentos y vigencias</h2>
        {tipos.length > 0 && !registrando && (
          <button type="button" onClick={() => setRegistrando(true)} className="min-h-11 rounded-md bg-brand-red px-3 text-sm font-semibold text-white">
            + Registrar documento
          </button>
        )}
      </div>
      {registrando && <Registrar clave={clave} tipos={tipos} onCerrar={() => setRegistrando(false)} />}

      <ul className="divide-y divide-slate-100">
        {filas.map((f) => {
          const d = vigenteDe(docs, f.tipo, f.sub ? (x) => x.subsistema === f.sub : undefined);
          const s = semaforo(d?.vence_en, !!d);
          const anteriores = docs.filter((x) => x.tipo === f.tipo && (!f.sub || x.subsistema === f.sub) && x.id !== d?.id);
          return (
            <li key={f.titulo} className="py-2">
              <div className="flex flex-wrap items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900">{f.titulo}</p>
                  {d ? <Detalle d={d} sst={sst} /> : <p className="text-xs text-slate-500">Sin registro.</p>}
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${SEMAFORO[s].clase}`}>
                  {d?.resultado === "no_apto" ? "NO APTO" : SEMAFORO[s].nombre}
                </span>
              </div>
              {anteriores.length > 0 && (
                <details className="mt-1">
                  <summary className="cursor-pointer text-xs text-slate-600">Anteriores ({anteriores.length})</summary>
                  <ul className="mt-1 space-y-1 border-l-2 border-slate-200 pl-2">
                    {anteriores.map((x) => (
                      <li key={x.id}>
                        <Detalle d={x} sst={sst} />
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </li>
          );
        })}
      </ul>

      <div>
        <h3 className="text-xs font-bold uppercase tracking-wide text-slate-600">Capacitaciones y otros</h3>
        {historia.length === 0 ? (
          <p className="text-xs text-slate-500">Nada registrado.</p>
        ) : (
          <ul className="mt-1 space-y-2">
            {historia.map((d) => (
              <li key={d.id} className="rounded-md border border-slate-100 p-2">
                <p className="text-xs font-semibold text-slate-700">{NOMBRE_TIPO_DOC[d.tipo]}</p>
                <Detalle d={d} sst={sst} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function Detalle({ d, sst }: { d: DocPersona; sst: boolean }) {
  const router = useRouter();
  const [pendiente, empezar] = useTransition();
  const [archivando, setArchivando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const cambiar = (cambios: Record<string, unknown>) =>
    empezar(async () => {
      setError(null);
      const { data, error: e } = await createClient().from("persona_documentos").update(cambios).eq("id", d.id).select("id");
      if (e) return setError(e.message);
      if (!data?.length) return setError("No se guardó: no tienes permiso para este documento.");
      setArchivando(false);
      router.refresh();
    });
  return (
    <div className={`text-xs ${d.archivado ? "text-slate-400 line-through" : "text-slate-700"}`}>
      <p>
        {resumen(d)}
        {d.entidad ? ` · ${d.entidad}` : ""}
      </p>
      <p>
        {d.vigente_desde ? `Desde ${d.vigente_desde}` : d.fecha_documento ? `Del ${d.fecha_documento}` : ""}
        {d.vence_en ? ` · ${d.tipo === "aptitud_ocupacional" ? "próximo examen" : "vence"} ${d.vence_en}` : ""}
      </p>
      {d.recomendaciones && <p className="no-underline">Recomendaciones: {d.recomendaciones}</p>}
      {d.custodia_ips && <p>Historia clínica custodiada por {d.custodia_ips}</p>}
      {d.tipo === "certificado_afiliacion" && <p>{d.verificado_en ? `Verificada por SG-SST el ${d.verificado_en.slice(0, 10)}` : "Sin verificar por SG-SST"}</p>}
      {d.archivado && d.motivo_archivo && <p className="no-underline">Archivado: {d.motivo_archivo}</p>}
      {!d.archivado && (
        <div className="mt-1 flex flex-wrap gap-2">
          {d.path && (
            <AbrirArchivo bucket={BUCKET_SST_PERSONAL} path={d.path} className="min-h-11 rounded-md border border-slate-300 px-3 text-xs font-semibold">
              Abrir archivo
            </AbrirArchivo>
          )}
          {sst && d.tipo === "certificado_afiliacion" && !d.verificado_en && (
            <button type="button" disabled={pendiente} onClick={() => cambiar({ verificado_en: new Date().toISOString() })} className="min-h-11 rounded-md bg-green-700 px-3 text-xs font-semibold text-white disabled:opacity-40">
              Verificar
            </button>
          )}
          {!archivando ? (
            <button type="button" onClick={() => setArchivando(true)} className="min-h-11 rounded-md border border-slate-300 px-3 text-xs">
              Archivar…
            </button>
          ) : (
            <span className="flex w-full flex-wrap gap-2">
              <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Por qué se archiva (p. ej. se registró mal)" className="min-h-11 flex-1 rounded-md border border-slate-300 px-2 text-xs" />
              <button type="button" disabled={pendiente || !motivo.trim()} onClick={() => cambiar({ archivado: true, motivo_archivo: motivo.trim() })} className="min-h-11 rounded-md bg-slate-900 px-3 text-xs font-semibold text-white disabled:opacity-40">
                Archivar
              </button>
            </span>
          )}
        </div>
      )}
      {error && <p className="text-red-800">{error}</p>}
    </div>
  );
}

function Registrar({ clave, tipos, onCerrar }: { clave: `e-${string}` | `c-${string}`; tipos: typeof TIPOS_DOC_PERSONA; onCerrar: () => void }) {
  const router = useRouter();
  const [tipo, setTipo] = useState<TipoDocPersona>(tipos[0].id);
  const [d, setD] = useState({ entidad: "", fecha_documento: "", vigente_desde: "", vence_en: "", examen: "periodico", resultado: "apto", recomendaciones: "", custodia_ips: "", nivel: "avanzado", tema: "", horas: "", subsistema: "eps", nombre: "", notas: "" });
  const [enfasis, setEnfasis] = useState<string[]>([]);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  const set = (k: keyof typeof d) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setD({ ...d, [k]: e.target.value });
  const mime = archivo ? (MIME[extension(archivo.name)] ?? null) : null;
  const falta =
    archivo && (!mime || !ARCHIVO_OK.has(mime))
      ? "El archivo va en PDF o foto."
      : archivo && archivo.size > 15 * 1024 * 1024
        ? "El archivo pasa de 15 MB."
        : tipo === "aptitud_ocupacional" && d.resultado === "apto_con_restricciones" && !d.recomendaciones.trim()
          ? "Con restricciones, escribe las recomendaciones laborales."
          : tipo === "capacitacion" && !d.tema.trim()
            ? "Escribe el tema."
            : d.vence_en && d.vigente_desde && d.vence_en < d.vigente_desde
              ? "Vence antes de empezar."
              : null;

  function guardar() {
    empezar(async () => {
      setError(null);
      const supabase = createClient();
      let archivoCols: Record<string, unknown> = {};
      if (archivo && mime) {
        const path = `personas/${clave}/${crypto.randomUUID()}-${nombreLimpio(archivo.name)}`;
        const s = await supabase.storage.from(BUCKET_SST_PERSONAL).upload(path, archivo, { contentType: mime, upsert: false });
        if (s.error) return setError(`No se pudo subir el archivo: ${s.error.message}`);
        archivoCols = { path, nombre_archivo: archivo.name, mime, bytes: archivo.size, sha256: await sha256Archivo(archivo) };
      }
      const t = (v: string) => v.trim() || null;
      const fila: Record<string, unknown> = {
        ...(clave.startsWith("e-") ? { empleado_id: clave.slice(2) } : { contratista_trabajador_id: clave.slice(2) }),
        tipo,
        nombre: t(d.nombre),
        entidad: t(d.entidad),
        fecha_documento: t(d.fecha_documento),
        vigente_desde: t(d.vigente_desde),
        vence_en: t(d.vence_en),
        notas: t(d.notas),
        ...(tipo === "aptitud_ocupacional" ? { examen: d.examen, resultado: d.resultado, enfasis, recomendaciones: t(d.recomendaciones), custodia_ips: t(d.custodia_ips) } : {}),
        ...(tipo === "certificado_alturas" ? { nivel: d.nivel } : {}),
        ...(tipo === "capacitacion" ? { tema: t(d.tema), horas: d.horas ? Number(d.horas) : null } : {}),
        ...(tipo === "certificado_afiliacion" ? { subsistema: d.subsistema } : {}),
        ...archivoCols,
      };
      const { error: e } = await supabase.from("persona_documentos").insert(fila);
      if (e) return setError(archivo ? `El archivo se subió pero no se registró: ${e.message}` : e.message);
      onCerrar();
      router.refresh();
    });
  }

  const info = tipos.find((x) => x.id === tipo)!;
  return (
    <div className="space-y-2 rounded-md border border-slate-300 bg-slate-50 p-3">
      <label className="block text-sm font-medium">
        Qué documento
        <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoDocPersona)} className={CAMPO}>
          {tipos.map((x) => (
            <option key={x.id} value={x.id}>
              {x.nombre}
            </option>
          ))}
        </select>
      </label>
      <p className="text-xs text-slate-600">{info.ayuda}</p>

      {tipo === "aptitud_ocupacional" && (
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="block text-sm">
            Examen
            <select value={d.examen} onChange={set("examen")} className={CAMPO}>
              {EXAMENES.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.nombre}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            Concepto
            <select value={d.resultado} onChange={set("resultado")} className={CAMPO}>
              {RESULTADOS.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.nombre}
                </option>
              ))}
            </select>
          </label>
          <fieldset className="sm:col-span-2">
            <legend className="text-sm">Énfasis</legend>
            <div className="mt-1 flex flex-wrap gap-2">
              {ENFASIS.map((x) => (
                <label key={x.id} className="flex min-h-11 items-center gap-2 rounded-md border border-slate-300 bg-white px-2 text-sm">
                  <input type="checkbox" className="h-5 w-5" checked={enfasis.includes(x.id)} onChange={(e) => setEnfasis(e.target.checked ? [...enfasis, x.id] : enfasis.filter((y) => y !== x.id))} />
                  {x.nombre}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="block text-sm sm:col-span-2">
            Recomendaciones laborales
            <textarea value={d.recomendaciones} onChange={set("recomendaciones")} rows={2} className={CAMPO} placeholder="Ej.: no levantar más de 15 kg; uso de protección auditiva" />
            <span className="mt-1 block rounded bg-amber-50 px-2 py-1 text-xs text-amber-900">
              Solo la recomendación laboral. Nunca el diagnóstico, resultados ni antecedentes: eso es de la historia clínica y la custodia la IPS.
            </span>
          </label>
          <label className="block text-sm sm:col-span-2">
            Quién custodia la historia clínica
            <input value={d.custodia_ips} onChange={set("custodia_ips")} className={CAMPO} placeholder="La IPS que hizo el examen" />
          </label>
        </div>
      )}
      {tipo === "certificado_alturas" && (
        <label className="block text-sm">
          Nivel
          <select value={d.nivel} onChange={set("nivel")} className={CAMPO}>
            {NIVELES_ALTURAS.map((x) => (
              <option key={x.id} value={x.id}>
                {x.nombre}
              </option>
            ))}
          </select>
        </label>
      )}
      {tipo === "capacitacion" && (
        <div className="grid gap-2 sm:grid-cols-[1fr_8rem]">
          <label className="block text-sm">
            Tema
            <input value={d.tema} onChange={set("tema")} className={CAMPO} placeholder="Ej.: inducción en sitio, uso de arnés" />
          </label>
          <label className="block text-sm">
            Horas
            <input value={d.horas} onChange={set("horas")} inputMode="decimal" className={CAMPO} />
          </label>
        </div>
      )}
      {tipo === "certificado_afiliacion" && (
        <label className="block text-sm">
          Subsistema
          <select value={d.subsistema} onChange={set("subsistema")} className={CAMPO}>
            {SUBSISTEMAS.map((x) => (
              <option key={x.id} value={x.id}>
                {x.nombre}
              </option>
            ))}
          </select>
        </label>
      )}
      {tipo === "otro" && (
        <label className="block text-sm">
          Qué es
          <input value={d.nombre} onChange={set("nombre")} className={CAMPO} />
        </label>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block text-sm sm:col-span-2">
          Entidad
          <input value={d.entidad} onChange={set("entidad")} className={CAMPO} placeholder={tipo === "certificado_afiliacion" ? "Ej.: Sura, Colpensiones, Positiva" : "Ej.: IPS, centro de entrenamiento"} />
        </label>
        <label className="block text-sm">
          Vigente desde
          <input type="date" value={d.vigente_desde} onChange={set("vigente_desde")} className={CAMPO} />
        </label>
        <label className="block text-sm">
          {tipo === "aptitud_ocupacional" ? "Próximo examen" : "Vence"}
          <input type="date" value={d.vence_en} onChange={set("vence_en")} className={CAMPO} />
        </label>
        <label className="block text-sm">
          Fecha del documento
          <input type="date" value={d.fecha_documento} onChange={set("fecha_documento")} className={CAMPO} />
        </label>
        <label className="block text-sm">
          Archivo (PDF o foto, opcional)
          <input type="file" accept="application/pdf,image/*" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} className="mt-1 block w-full text-sm" />
        </label>
        <label className="block text-sm sm:col-span-2">
          Notas
          <input value={d.notas} onChange={set("notas")} className={CAMPO} />
        </label>
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={onCerrar} className="min-h-11 flex-1 rounded-md border border-slate-300 text-sm">
          Cancelar
        </button>
        <button type="button" disabled={pendiente || !!falta} onClick={guardar} className="min-h-11 flex-1 rounded-md bg-slate-900 text-sm font-semibold text-white disabled:opacity-40">
          {pendiente ? "Guardando…" : "Registrar"}
        </button>
      </div>
      {falta && <p className="text-xs text-amber-900">{falta}</p>}
      {error && <p className="rounded-md bg-red-50 px-2 py-1 text-sm text-red-800">{error}</p>}
    </div>
  );
}
