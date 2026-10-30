"use client";
/* eslint-disable @next/next/no-img-element -- enlaces firmados y temporales del bucket privado */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { nombreLimpio, sha256Archivo } from "@/lib/documentos/catalogo";
import { estadoPublicable, fechaCorta, type Autorizacion } from "@/lib/marketing";

export interface Material {
  id: string;
  tipo: string;
  titulo: string;
  descripcion: string | null;
  path: string | null;
  cliente_id: string | null;
  etiquetas: string[];
  tomada_en: string | null;
  identificable: boolean;
  autorizacion: Autorizacion;
  autorizacion_nota: string | null;
  autorizada_en: string | null;
  archivada: boolean;
  subido_en: string;
  cliente: string | null;
  url: string | null;
}

// Lo que acepta el bucket "marketing" (migración 125).
const ACEPTA = "image/jpeg,image/png,image/webp,image/heic,image/gif,video/mp4,video/quicktime,application/pdf";
const LIMITE = 50 * 1024 * 1024;

/**
 * Por qué existe la autorización. Va siempre a la vista: si no se explica, la gente la marca
 * "concedida" sin preguntarle a nadie (pedido del orquestador, 2026-10-30).
 */
function AvisoAutorizacion() {
  return (
    <section className="rounded-lg border-2 border-amber-400 bg-amber-50 p-3 text-sm text-amber-950">
      <p className="font-bold">Por qué cada foto pide la autorización del cliente</p>
      <p className="mt-1">
        Publicar la instalación de seguridad de un cliente <b>lo expone</b>. Una foto donde se ve dónde quedaron las cámaras, el control de acceso o el panel de incendio de una copropiedad le sirve a quien quiera entrar. Y casi ningún
        cliente dio permiso para salir en redes.
      </p>
      <p className="mt-1">
        Por eso, si en la foto <b>se reconoce de quién es la obra</b>, queda «sin autorización» y <b>ninguna publicación que la use se puede aprobar</b> hasta que el cliente diga que sí. Lo bloquea la base de datos, no la memoria de quien publica.
      </p>
      <p className="mt-1">
        Marca «el cliente autorizó» <b>solo si el cliente lo dijo</b>, mejor por escrito, y anota quién, cuándo y por qué medio. Si no le preguntaste a nadie, no está autorizado. Una vez publicado, ya lo vio quien lo tenía que ver: no se deshace.
      </p>
    </section>
  );
}

const SE_RECONOCE = "Fachada o portería, nombre o logo del conjunto o la empresa, placa o dirección, personas o vehículos reconocibles, o se puede ubicar dónde quedaron cámaras, accesos o paneles.";

export function Biblioteca({ yo, escribe, archivadas, clientes, materiales }: { yo: string; escribe: boolean; archivadas: boolean; clientes: { id: string; nombre: string }[]; materiales: Material[] }) {
  const [filtro, setFiltro] = useState<"todas" | "bloqueadas" | "publicables">("todas");
  const lista = materiales.filter((x) => {
    if (filtro === "todas") return true;
    const p = estadoPublicable(x.identificable, x.autorizacion).publicable;
    return filtro === "publicables" ? p : !p;
  });
  const bloqueadas = materiales.filter((x) => !estadoPublicable(x.identificable, x.autorizacion).publicable).length;
  return (
    <div className="space-y-3">
      <AvisoAutorizacion />
      {escribe && !archivadas && <Subir clientes={clientes} yo={yo} />}
      <div className="flex flex-wrap gap-1.5 text-sm">
        {(
          [
            ["todas", `Todas (${materiales.length})`],
            ["bloqueadas", `Sin autorización (${bloqueadas})`],
            ["publicables", `Se pueden publicar (${materiales.length - bloqueadas})`],
          ] as const
        ).map(([k, t]) => (
          <button key={k} type="button" aria-pressed={filtro === k} onClick={() => setFiltro(k)} className={`min-h-11 rounded-lg border px-3 ${filtro === k ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white"}`}>
            {t}
          </button>
        ))}
      </div>
      {lista.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-500">{materiales.length ? "Nada con ese filtro." : "Todavía no hay material."}</p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {lista.map((x) => (
            <Tarjeta key={x.id} x={x} yo={yo} escribe={escribe} />
          ))}
        </ul>
      )}
    </div>
  );
}

function Subir({ clientes, yo }: { clientes: { id: string; nombre: string }[]; yo: string }) {
  const router = useRouter();
  const [archivo, setArchivo] = useState<File | null>(null);
  const [titulo, setTitulo] = useState("");
  const [identificable, setIdentificable] = useState<boolean | null>(null);
  const [cliente, setCliente] = useState("");
  const [yaAutorizo, setYaAutorizo] = useState(false);
  const [nota, setNota] = useState("");
  const [tomada, setTomada] = useState("");
  const [etiquetas, setEtiquetas] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  const clienteId = clientes.find((c) => c.nombre === cliente.trim())?.id ?? null;

  const listo = !!archivo && !!titulo.trim() && identificable !== null && (!identificable || !yaAutorizo || nota.trim().length >= 10);

  const subir = () =>
    empezar(async () => {
      setError(null);
      setAviso(null);
      if (!archivo || identificable === null) return;
      if (archivo.size > LIMITE) return setError("El archivo pasa de 50 MB.");
      const supabase = createClient();
      const path = `biblioteca/${crypto.randomUUID()}-${nombreLimpio(archivo.name)}`;
      const s = await supabase.storage.from("marketing").upload(path, archivo, { contentType: archivo.type, upsert: false });
      if (s.error) return setError(`No se subió el archivo: ${s.error.message}`);
      const tipo = archivo.type.startsWith("video/") ? "video" : archivo.type.startsWith("image/") ? "foto" : "otro";
      const concedida = identificable && yaAutorizo;
      const { error: e } = await supabase.from("marketing_biblioteca").insert({
        tipo,
        titulo: titulo.trim(),
        path,
        bytes: archivo.size,
        sha256: await sha256Archivo(archivo),
        cliente_id: clienteId,
        etiquetas: etiquetas.split(",").map((t) => t.trim()).filter(Boolean),
        tomada_en: tomada || null,
        identificable,
        autorizacion: !identificable ? "no_aplica" : concedida ? "concedida" : "pendiente",
        autorizacion_nota: concedida ? nota.trim() : null,
        autorizada_por: concedida ? yo : null,
        autorizada_en: concedida ? new Date().toISOString() : null,
      });
      if (e) return setError(e.message.includes("sha256") || e.message.includes("duplicate") ? `Ese archivo ya está en la biblioteca (${e.message}).` : `El archivo subió pero no quedó registrado: ${e.message}`);
      setArchivo(null);
      setTitulo("");
      setIdentificable(null);
      setCliente("");
      setYaAutorizo(false);
      setNota("");
      setTomada("");
      setEtiquetas("");
      setAviso("Subido.");
      router.refresh();
    });

  return (
    <section className="space-y-3 rounded-lg border border-slate-300 bg-white p-3">
      <h2 className="text-sm font-bold text-slate-900">Subir material</h2>
      <input
        type="file"
        accept={ACEPTA}
        onChange={(e) => {
          const a = e.target.files?.[0] ?? null;
          setArchivo(a);
          if (a && !titulo) setTitulo(a.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " "));
        }}
        className="block min-h-11 w-full text-sm"
      />
      <label className="block text-sm font-semibold text-slate-800">
        Qué se ve
        <input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ej.: Tablero de control de acceso terminado" className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 px-3 text-base font-normal" />
      </label>

      {/* La pregunta no tiene respuesta por defecto: hay que contestarla para poder subir. */}
      <fieldset className={`rounded-lg border-2 p-3 ${identificable === null ? "border-amber-400 bg-amber-50" : "border-slate-200"}`}>
        <legend className="px-1 text-sm font-bold text-slate-900">¿Se reconoce de quién es la obra o el lugar? (obligatorio)</legend>
        <p className="mb-2 text-xs text-slate-700">Se reconoce si se ve: {SE_RECONOCE}</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className={`flex min-h-12 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm ${identificable === true ? "border-red-500 bg-red-50 font-semibold" : "border-slate-300 bg-white"}`}>
            <input type="radio" name="identificable" checked={identificable === true} onChange={() => setIdentificable(true)} className="h-5 w-5" />
            Sí, o no estoy seguro
          </label>
          <label className={`flex min-h-12 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm ${identificable === false ? "border-slate-700 bg-slate-100 font-semibold" : "border-slate-300 bg-white"}`}>
            <input type="radio" name="identificable" checked={identificable === false} onChange={() => setIdentificable(false)} className="h-5 w-5" />
            No: no se puede saber de quién es
          </label>
        </div>
        {identificable === true && (
          <div className="mt-3 space-y-2">
            <label className="block text-sm font-semibold text-slate-800">
              De qué cliente es
              <input list="clientes-marketing" value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder="Escribe y elige el cliente" className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base font-normal" />
              <datalist id="clientes-marketing">
                {clientes.map((c) => (
                  <option key={c.id} value={c.nombre} />
                ))}
              </datalist>
            </label>
            {cliente.trim() && !clienteId && <p className="text-xs text-amber-800">Ese nombre no coincide con un cliente registrado: se guarda sin cliente.</p>}
            <label className="flex min-h-11 cursor-pointer items-start gap-2 text-sm">
              <input type="checkbox" checked={yaAutorizo} onChange={(e) => setYaAutorizo(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0" />
              <span>El cliente ya autorizó que salga en redes (lo dijo alguien del cliente, no lo supongo).</span>
            </label>
            {yaAutorizo && (
              <label className="block text-sm font-semibold text-slate-800">
                Quién autorizó, cuándo y por qué medio (obligatorio)
                <textarea rows={2} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ej.: Sandra Gómez, administradora, por correo del 28/10/2026" className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-base font-normal" />
              </label>
            )}
            {!yaAutorizo && <p className="text-xs font-semibold text-red-800">Queda «sin autorización»: se puede guardar y preparar, pero no se puede aprobar una publicación con esta foto.</p>}
          </div>
        )}
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm font-semibold text-slate-800">
          Cuándo se tomó
          <input type="date" value={tomada} onChange={(e) => setTomada(e.target.value)} className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 px-3 text-base font-normal" />
        </label>
        <label className="block text-sm font-semibold text-slate-800">
          Etiquetas (separadas por coma)
          <input value={etiquetas} onChange={(e) => setEtiquetas(e.target.value)} placeholder="cctv, alturas, antes y después" className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 px-3 text-base font-normal" />
        </label>
      </div>
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
      {aviso && <p className="text-sm text-green-800">{aviso}</p>}
      <button type="button" disabled={pendiente || !listo} onClick={subir} className="min-h-12 w-full rounded-lg bg-brand-red text-base font-semibold text-white disabled:opacity-40">
        {pendiente ? "Subiendo…" : identificable === null ? "Contesta si se reconoce de quién es" : "Subir"}
      </button>
    </section>
  );
}

function Tarjeta({ x, yo, escribe }: { x: Material; yo: string; escribe: boolean }) {
  const router = useRouter();
  const [abierta, setAbierta] = useState(false);
  const [nota, setNota] = useState("");
  const [confirmo, setConfirmo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  const e = estadoPublicable(x.identificable, x.autorizacion);

  const cambiar = (cambios: Record<string, unknown>) =>
    empezar(async () => {
      setError(null);
      const { data, error: err } = await createClient().from("marketing_biblioteca").update(cambios).eq("id", x.id).select("id");
      if (err) return setError(err.message);
      if (!data?.length) return setError("No se guardó (sin permiso).");
      setAbierta(false);
      setNota("");
      setConfirmo(false);
      router.refresh();
    });
  const marcar = (autorizacion: Autorizacion) =>
    cambiar({
      autorizacion,
      autorizacion_nota: autorizacion === "pendiente" ? null : nota.trim(),
      autorizada_por: autorizacion === "pendiente" ? null : yo,
      autorizada_en: autorizacion === "pendiente" ? null : new Date().toISOString(),
    });

  return (
    <li className="overflow-hidden rounded-lg border border-slate-300 bg-white">
      {x.url ? (
        <a href={x.url} target="_blank" rel="noreferrer">
          <img src={x.url} alt={x.titulo} className="aspect-video w-full bg-slate-100 object-cover" />
        </a>
      ) : (
        <div className="flex aspect-video items-center justify-center bg-slate-100 text-sm text-slate-500">{x.tipo}</div>
      )}
      <div className="space-y-1.5 p-2">
        {/* Lo primero que se lee: si se puede publicar. */}
        <p className={`rounded-md border px-2 py-1 text-sm font-bold ${e.clase}`}>{e.texto}</p>
        <p className="text-sm font-semibold text-slate-900">{x.titulo}</p>
        <p className="text-xs text-slate-600">
          {[x.cliente, x.tomada_en && `tomada ${fechaCorta(x.tomada_en)}`, x.etiquetas.join(", ")].filter(Boolean).join(" · ") || "Sin cliente ni etiquetas"}
        </p>
        {x.autorizacion_nota && (
          <p className="text-xs text-slate-700">
            {x.autorizacion === "negada" ? "Negó" : "Autorizó"}: {x.autorizacion_nota}
            {x.autorizada_en ? ` (registrado ${fechaCorta(x.autorizada_en)})` : ""}
          </p>
        )}
        {escribe && !x.archivada && (
          <button type="button" onClick={() => setAbierta((v) => !v)} className="min-h-11 w-full rounded-lg border border-slate-300 text-sm">
            {abierta ? "Cerrar" : "Cambiar autorización o archivar"}
          </button>
        )}
        {abierta && (
          <div className="space-y-2 rounded-lg bg-slate-50 p-2">
            {x.identificable ? (
              <>
                <label className="block text-xs font-semibold text-slate-800">
                  Quién respondió por el cliente, cuándo y por qué medio
                  <textarea rows={2} value={nota} onChange={(ev) => setNota(ev.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 px-2 py-1.5 text-base font-normal" />
                </label>
                <label className="flex min-h-11 cursor-pointer items-start gap-2 text-xs">
                  <input type="checkbox" checked={confirmo} onChange={(ev) => setConfirmo(ev.target.checked)} className="mt-0.5 h-5 w-5 shrink-0" />
                  <span>Confirmo que alguien del cliente respondió; no lo estoy suponiendo.</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" disabled={pendiente || !confirmo || nota.trim().length < 10} onClick={() => marcar("concedida")} className="min-h-11 rounded-lg bg-green-700 text-sm font-semibold text-white disabled:opacity-40">
                    El cliente autorizó
                  </button>
                  <button type="button" disabled={pendiente || !confirmo || nota.trim().length < 10} onClick={() => marcar("negada")} className="min-h-11 rounded-lg bg-slate-900 text-sm font-semibold text-white disabled:opacity-40">
                    El cliente no autorizó
                  </button>
                </div>
                {x.autorizacion !== "pendiente" && (
                  <button type="button" disabled={pendiente} onClick={() => marcar("pendiente")} className="min-h-11 w-full rounded-lg border border-slate-300 text-sm">
                    Volver a «sin autorización»
                  </button>
                )}
              </>
            ) : (
              <button
                type="button"
                disabled={pendiente}
                onClick={() => window.confirm("¿Marcar que SÍ se reconoce de quién es? Queda sin autorización hasta que el cliente responda.") && cambiar({ identificable: true, autorizacion: "pendiente", autorizacion_nota: null, autorizada_por: null, autorizada_en: null })}
                className="min-h-11 w-full rounded-lg border border-red-400 text-sm font-semibold text-red-800"
              >
                Sí se reconoce de quién es
              </button>
            )}
            <button type="button" disabled={pendiente} onClick={() => window.confirm("¿Archivar? Deja de salir en la biblioteca; no se borra.") && cambiar({ archivada: true })} className="min-h-11 w-full rounded-lg border border-slate-300 text-sm text-slate-600">
              Archivar
            </button>
          </div>
        )}
        {escribe && x.archivada && (
          <button type="button" disabled={pendiente} onClick={() => cambiar({ archivada: false })} className="min-h-11 w-full rounded-lg border border-slate-300 text-sm">
            Sacar del archivo
          </button>
        )}
        {error && <p className="rounded-md bg-red-50 px-2 py-1 text-xs text-red-800">{error}</p>}
      </div>
    </li>
  );
}
