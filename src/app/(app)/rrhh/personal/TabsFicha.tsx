"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { AbrirArchivo, BUCKET_PERSONAL, ElegirArchivo, subirSoporte } from "@/components/rrhh/archivos";
import { fechaCorta } from "@/lib/rrhh-registros";
import { Bloque } from "./TabDatos";

const C = "mt-0.5 block w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm";
const L = "block text-xs text-slate-600";
const BOTON = "min-h-9 rounded-md bg-slate-900 px-3 text-xs font-semibold text-white disabled:opacity-40";
const BOTON2 = "min-h-9 rounded-md border border-slate-300 px-3 text-xs font-semibold disabled:opacity-40";

function useAccion() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  const correr = (fn: () => Promise<string | void>) =>
    empezar(async () => {
      setError(null);
      setAviso(null);
      try {
        const ok = await fn();
        if (ok) setAviso(ok);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  const mensajes = (
    <>
      {error && <p className="rounded-md bg-red-50 px-2 py-1 text-xs text-red-800">{error}</p>}
      {aviso && <p className="rounded-md bg-green-50 px-2 py-1 text-xs text-green-800">{aviso}</p>}
    </>
  );
  return { correr, pendiente, mensajes };
}
const ok = async <T,>(p: PromiseLike<{ error: { message: string } | null; data?: T }>) => {
  const r = await p;
  if (r.error) throw new Error(r.error.message);
  return r.data as T;
};

// ============================================================ Hoja de vida
export interface ArchivoEmpleado {
  id: string;
  tipo: string;
  storage_path: string;
  nombre_archivo: string | null;
  subido_en: string;
}
const TIPO_ARCHIVO: Record<string, string> = { hoja_de_vida: "Hoja de vida", certificacion: "Certificación", otro: "Otro" };

export function TabHojaVida({ empleadoId, notas: notasIniciales, archivos }: { empleadoId: string; notas: string; archivos: ArchivoEmpleado[] }) {
  const { correr, pendiente, mensajes } = useAccion();
  const [notas, setNotas] = useState(notasIniciales);
  const [tipo, setTipo] = useState("hoja_de_vida");
  const [archivo, setArchivo] = useState<File | null>(null);
  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-600">Hoja de vida, certificaciones y documentos del colaborador. Se guardan en el archivo de la empresa (no en el listado).</p>
      <Bloque titulo="Notas / información relevante">
        <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={4} placeholder="Perfil, estudios, observaciones de selección…" className={C} />
        <button
          type="button"
          disabled={pendiente || notas === notasIniciales}
          onClick={() => correr(async () => (await ok(createClient().from("empleados").update({ notas_hoja_vida: notas.trim() || null }).eq("id", empleadoId)), "Notas guardadas."))}
          className={`${BOTON} mt-2`}
        >
          Guardar notas
        </button>
        {notas === notasIniciales && <span className="ml-2 text-xs text-slate-500">Sin cambios por guardar.</span>}
      </Bloque>
      <Bloque titulo="Archivos">
        <div className="grid grid-cols-2 gap-2">
          <label className={L}>
            Tipo
            <select value={tipo} onChange={(e) => setTipo(e.target.value)} className={C}>
              {Object.entries(TIPO_ARCHIVO).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <div className={L}>
            Archivo <span className="text-slate-400">(PDF, Word o imagen · máx. 10 MB)</span>
            {archivo ? (
              <p className="mt-1 flex items-center justify-between gap-2 text-sm text-slate-800">
                <span className="truncate">📎 {archivo.name}</span>
                <button type="button" onClick={() => setArchivo(null)} className="text-xs underline">
                  Quitar
                </button>
              </p>
            ) : (
              <div className="mt-0.5">
                <ElegirArchivo onElegido={setArchivo} textoFoto="📷" textoArchivo="Elegir" conWord />
              </div>
            )}
          </div>
        </div>
        <button
          type="button"
          disabled={pendiente || !archivo}
          onClick={() =>
            correr(async () => {
              const s = await subirSoporte(`personal/${empleadoId}/hoja-de-vida`, archivo!, BUCKET_PERSONAL);
              await ok(
                createClient()
                  .from("empleado_archivos")
                  .insert({ empleado_id: empleadoId, tipo, storage_path: s.path, nombre_archivo: s.nombre, mime: s.mime, bytes: s.bytes }),
              );
              setArchivo(null);
              return "Archivo subido.";
            })
          }
          className={`${BOTON} mt-2`}
        >
          Subir archivos
        </button>
        {!archivo && <span className="ml-2 text-xs text-slate-500">Elige un archivo primero.</span>}
        <ul className="mt-2 space-y-1 text-sm">
          {archivos.length === 0 && <li className="text-xs text-slate-500">Sin archivos todavía.</li>}
          {archivos.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-x-2 text-xs">
              <span className="font-semibold">{TIPO_ARCHIVO[a.tipo] ?? a.tipo}</span>·
              <AbrirArchivo bucket={BUCKET_PERSONAL} path={a.storage_path}>
                {a.nombre_archivo ?? "archivo"}
              </AbrirArchivo>
              <span className="text-slate-500">· {fechaCorta(a.subido_en)}</span>
            </li>
          ))}
        </ul>
      </Bloque>
      {mensajes}
    </div>
  );
}

// ============================================================ Accesos
export function TabAccesos({
  empleadoId,
  perfilId,
  personas,
  enlazados,
}: {
  empleadoId: string;
  perfilId: string | null;
  personas: { id: string; nombre: string }[];
  /** Usuarios ya enlazados a otra ficha: no se ofrecen. */
  enlazados: string[];
}) {
  const { correr, pendiente, mensajes } = useAccion();
  const [elegido, setElegido] = useState(perfilId ?? "");
  const actual = personas.find((p) => p.id === perfilId);
  const libres = personas.filter((p) => p.id === perfilId || !enlazados.includes(p.id));
  return (
    <div className="space-y-3">
      <Bloque titulo="Usuario del ERP">
        <p className="text-sm">
          {actual ? (
            <>
              Enlazada con el usuario <span className="font-semibold">{actual.nombre}</span>.
            </>
          ) : (
            "Esta ficha no está enlazada a ningún usuario del ERP."
          )}
        </p>
        <p className="mt-1 text-xs text-slate-600">
          Con el enlace, los desprendibles y liquidaciones que se publiquen le aparecen a esta persona en “Documentos y certificados”, y solo a ella.
        </p>
        <div className="mt-2 flex gap-2">
          <select value={elegido} onChange={(e) => setElegido(e.target.value)} className={`${C} mt-0 flex-1`}>
            <option value="">Sin usuario</option>
            {libres.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
          {elegido !== (perfilId ?? "") && (
            <button
              type="button"
              disabled={pendiente}
              onClick={() =>
                correr(async () => (await ok(createClient().from("empleados").update({ perfil_id: elegido || null }).eq("id", empleadoId)), "Enlace guardado."))
              }
              className={BOTON}
            >
              Guardar
            </button>
          )}
        </div>
      </Bloque>
      <Bloque titulo="Contraseña y rol de menú">
        <p className="text-sm text-slate-700">
          La contraseña <span className="font-semibold">no se guarda en la ficha</span>: guardarla dejaría a cualquiera que vea fichas entrar como esa
          persona, y ya no se sabría quién hizo qué. Cada usuario maneja la suya al iniciar sesión.
        </p>
        <p className="mt-2 text-sm text-slate-700">
          El usuario, su correo y su rol (lo que ve en el menú) se crean y cambian en{" "}
          <a href="/configuracion/usuarios" className="font-semibold text-[#A82323] underline">
            Configuración → Usuarios y permisos
          </a>
          . El rol no se toma del cargo.
        </p>
      </Bloque>
      {mensajes}
    </div>
  );
}

// ============================================================ Dotación
export interface Entrega {
  id: string;
  categoria: "herramienta" | "epp" | "uniforme";
  herramienta_id: string | null;
  nombre: string | null;
  cantidad: number;
  talla: string | null;
  fecha_entrega: string;
  foto_path: string | null;
  observacion: string | null;
  devuelta_en: string | null;
}
export interface Herramienta {
  id: string;
  nombre: string;
  serial: string | null;
  estado: string;
}
const CATEGORIA: Record<Entrega["categoria"], string> = { herramienta: "Herramienta", epp: "EPP", uniforme: "Uniforme" };

export function TabDotacion({
  empleadoId,
  tallas,
  entregas,
  herramientas,
  hoy,
}: {
  empleadoId: string;
  tallas: { talla_camisa: string; talla_pantalon: string; talla_botas: string };
  entregas: Entrega[];
  herramientas: Herramienta[];
  hoy: string;
}) {
  const { correr, pendiente, mensajes } = useAccion();
  const [t, setT] = useState(tallas);
  const cambioTallas = JSON.stringify(t) !== JSON.stringify(tallas);
  const [nueva, setNueva] = useState(false);
  const [categoria, setCategoria] = useState<Entrega["categoria"]>("herramienta");
  const [herramientaId, setHerramientaId] = useState("");
  const [nombre, setNombre] = useState("");
  const [cantidad, setCantidad] = useState("1");
  const [talla, setTalla] = useState("");
  const [fecha, setFecha] = useState(hoy);
  const [obs, setObs] = useState("");
  const [foto, setFoto] = useState<File | null>(null);
  const [nuevaHerr, setNuevaHerr] = useState({ nombre: "", serial: "" });
  const nombreHerr = new Map(herramientas.map((h) => [h.id, `${h.nombre}${h.serial ? ` (${h.serial})` : ""}`]));
  const faltaEntrega = !herramientaId && !nombre.trim() ? "Elige una herramienta del inventario o escribe el nombre." : !fecha ? "Falta la fecha de entrega." : null;

  return (
    <div className="space-y-3">
      <Bloque titulo="Tallas de dotación">
        <p className="mb-2 text-xs text-slate-600">Camisa, pantalón y botas del colaborador. Se guardan con la ficha y sirven para pedidos de uniforme y EPP.</p>
        <div className="grid grid-cols-3 gap-2">
          <label className={L}>
            Camisa
            <input value={t.talla_camisa} onChange={(e) => setT({ ...t, talla_camisa: e.target.value })} placeholder="S, M, L, XL, 38…" className={C} />
          </label>
          <label className={L}>
            Pantalón
            <input value={t.talla_pantalon} onChange={(e) => setT({ ...t, talla_pantalon: e.target.value })} placeholder="28, 30, 32, M…" className={C} />
          </label>
          <label className={L}>
            Botas
            <input value={t.talla_botas} onChange={(e) => setT({ ...t, talla_botas: e.target.value })} placeholder="38, 40, 42…" className={C} />
          </label>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {cambioTallas && (
            <button
              type="button"
              disabled={pendiente}
              onClick={() =>
                correr(async () => {
                  await ok(
                    createClient()
                      .from("empleados")
                      .update({ talla_camisa: t.talla_camisa.trim() || null, talla_pantalon: t.talla_pantalon.trim() || null, talla_botas: t.talla_botas.trim() || null })
                      .eq("id", empleadoId),
                  );
                  return "Tallas guardadas.";
                })
              }
              className={BOTON}
            >
              Guardar tallas
            </button>
          )}
          <a href={`/rrhh/personal/${empleadoId}/imprimir?doc=acta`} target="_blank" rel="noreferrer" className={`${BOTON2} inline-flex items-center`}>
            Acta de entrega (PDF)
          </a>
        </div>
      </Bloque>

      <Bloque titulo="Herramientas de trabajo, EPP y uniformes">
        <p className="mb-2 text-xs text-slate-600">
          Asigne un activo del inventario o registre una herramienta propia. Incluya fecha de entrega y foto. Puede editar o borrar cada ítem.
        </p>
        <ul className="space-y-2">
          {entregas.length === 0 && <li className="text-xs text-slate-500">Nada entregado todavía.</li>}
          {entregas.map((e) => (
            <li key={e.id} className="rounded-md border border-slate-200 p-2 text-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">
                    {e.herramienta_id ? (nombreHerr.get(e.herramienta_id) ?? "Herramienta del inventario") : e.nombre}
                    {e.cantidad > 1 ? ` × ${e.cantidad}` : ""}
                  </p>
                  <p className="text-xs text-slate-600">
                    {CATEGORIA[e.categoria]}
                    {e.talla ? ` · talla ${e.talla}` : ""} · entregado el {fechaCorta(e.fecha_entrega)}
                    {e.devuelta_en ? ` · devuelto el ${fechaCorta(e.devuelta_en)}` : ""}
                  </p>
                  {e.observacion && <p className="text-xs text-slate-600">{e.observacion}</p>}
                  {e.foto_path && (
                    <AbrirArchivo bucket={BUCKET_PERSONAL} path={e.foto_path}>
                      📷 Foto
                    </AbrirArchivo>
                  )}
                </div>
                <div className="flex shrink-0 flex-col gap-1">
                  {!e.devuelta_en && (
                    <button
                      type="button"
                      disabled={pendiente}
                      onClick={() => correr(async () => (await ok(createClient().from("dotacion_entregas").update({ devuelta_en: hoy }).eq("id", e.id)), "Marcado como devuelto."))}
                      className={BOTON2}
                    >
                      Devuelto
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={pendiente}
                    onClick={() =>
                      correr(async () => {
                        if (!window.confirm("¿Borrar esta entrega?")) return;
                        await ok(createClient().from("dotacion_entregas").delete().eq("id", e.id));
                        return "Entrega borrada.";
                      })
                    }
                    className={`${BOTON2} text-red-800`}
                  >
                    Borrar
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>

        {nueva ? (
          <div className="mt-3 space-y-2 rounded-md bg-slate-50 p-2">
            <div className="grid grid-cols-2 gap-2">
              <label className={L}>
                Qué es
                <select value={categoria} onChange={(e) => setCategoria(e.target.value as Entrega["categoria"])} className={C}>
                  {Object.entries(CATEGORIA).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <label className={L}>
                Activo del inventario
                <select value={herramientaId} onChange={(e) => setHerramientaId(e.target.value)} className={C}>
                  <option value="">— Del inventario interno (opcional) —</option>
                  {herramientas
                    .filter((h) => h.estado !== "baja")
                    .map((h) => (
                      <option key={h.id} value={h.id}>
                        {nombreHerr.get(h.id)}
                      </option>
                    ))}
                </select>
              </label>
            </div>
            {!herramientaId && (
              <label className={L}>
                O nombre de la herramienta / elemento
                <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Taladro, escalera, botas dieléctricas…" className={C} />
              </label>
            )}
            <div className="grid grid-cols-3 gap-2">
              <label className={L}>
                Cantidad
                <input value={cantidad} onChange={(e) => setCantidad(e.target.value)} inputMode="numeric" className={C} />
              </label>
              <label className={L}>
                Talla
                <input value={talla} onChange={(e) => setTalla(e.target.value)} className={C} />
              </label>
              <label className={L}>
                Fecha entrega
                <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={C} />
              </label>
            </div>
            <label className={L}>
              Observación
              <input value={obs} onChange={(e) => setObs(e.target.value)} className={C} />
            </label>
            {foto ? (
              <p className="text-xs">
                📷 {foto.name}{" "}
                <button type="button" onClick={() => setFoto(null)} className="underline">
                  Quitar
                </button>
              </p>
            ) : (
              <ElegirArchivo onElegido={setFoto} textoFoto="📷 Foto" textoArchivo="Elegir foto" />
            )}
            <div className="flex gap-2">
              <button type="button" onClick={() => setNueva(false)} className={`${BOTON2} flex-1`}>
                Cancelar
              </button>
              <button
                type="button"
                disabled={pendiente || faltaEntrega !== null}
                onClick={() =>
                  correr(async () => {
                    const s = foto ? await subirSoporte(`personal/${empleadoId}/dotacion`, foto, BUCKET_PERSONAL) : null;
                    await ok(
                      createClient()
                        .from("dotacion_entregas")
                        .insert({
                          empleado_id: empleadoId,
                          categoria,
                          herramienta_id: herramientaId || null,
                          nombre: herramientaId ? null : nombre.trim(),
                          cantidad: Math.max(1, Number(cantidad) || 1),
                          talla: talla.trim() || null,
                          fecha_entrega: fecha,
                          observacion: obs.trim() || null,
                          foto_path: s?.path ?? null,
                        }),
                    );
                    if (herramientaId) await ok(createClient().from("herramientas").update({ estado: "asignada" }).eq("id", herramientaId));
                    setNueva(false);
                    setNombre("");
                    setHerramientaId("");
                    setFoto(null);
                    setObs("");
                    return "Entrega registrada.";
                  })
                }
                className={`${BOTON} flex-1`}
              >
                Registrar entrega
              </button>
            </div>
            {faltaEntrega && <p className="text-xs text-slate-500">{faltaEntrega}</p>}
          </div>
        ) : (
          <button type="button" onClick={() => setNueva(true)} className={`${BOTON} mt-3`}>
            + Registrar entrega
          </button>
        )}
      </Bloque>

      <Bloque titulo="Inventario interno de herramientas">
        <p className="mb-2 text-xs text-slate-600">Las herramientas de la empresa que se entregan a alguien. No es un inventario de bodega: solo la lista de activos.</p>
        <div className="grid grid-cols-2 gap-2">
          <label className={L}>
            Herramienta
            <input value={nuevaHerr.nombre} onChange={(e) => setNuevaHerr({ ...nuevaHerr, nombre: e.target.value })} placeholder="Taladro percutor" className={C} />
          </label>
          <label className={L}>
            Serial
            <input value={nuevaHerr.serial} onChange={(e) => setNuevaHerr({ ...nuevaHerr, serial: e.target.value })} className={C} />
          </label>
        </div>
        <button
          type="button"
          disabled={pendiente || !nuevaHerr.nombre.trim()}
          onClick={() =>
            correr(async () => {
              await ok(createClient().from("herramientas").insert({ nombre: nuevaHerr.nombre.trim(), serial: nuevaHerr.serial.trim() || null }));
              setNuevaHerr({ nombre: "", serial: "" });
              return "Herramienta agregada al inventario.";
            })
          }
          className={`${BOTON} mt-2`}
        >
          + Agregar al inventario
        </button>
        {!nuevaHerr.nombre.trim() && <span className="ml-2 text-xs text-slate-500">Escribe el nombre.</span>}
        <p className="mt-2 text-xs text-slate-500">
          {herramientas.length} en el inventario · {herramientas.filter((h) => h.estado === "asignada").length} asignadas
        </p>
      </Bloque>
      {mensajes}
    </div>
  );
}
