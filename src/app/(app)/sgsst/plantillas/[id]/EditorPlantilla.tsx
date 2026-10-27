"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { FormularioSst } from "@/components/sst/FormularioSst";
import {
  idDesdeEtiqueta,
  NOMBRE_TIPO,
  problemaCampos,
  AMBITO,
  rolesFirma,
  TIPOS_CAMPO,
  TIPOS_COLUMNA,
  type Campo,
  type Ambito,
  type FirmaPedida,
  type Plantilla,
  type TipoCampo,
  type TipoColumna,
} from "@/lib/sst/plantillas";

const CAMPO = "mt-1 block w-full rounded-md border border-slate-300 px-2 py-2 text-base";

/** Sin renglones vacíos en las opciones (al escribir quedan; al guardar, no). */
function limpiar(campos: Campo[]): Campo[] {
  const ops = (o?: string[]) => (o ? o.map((x) => x.trim()).filter(Boolean) : o);
  return campos.map((c) => ({ ...c, etiqueta: c.etiqueta.trim(), opciones: ops(c.opciones), columnas: c.columnas?.map((col) => ({ ...col, etiqueta: col.etiqueta.trim(), opciones: ops(col.opciones) })) }));
}

/**
 * El armador (SG-SST y actas de Proyectos, migración 85): quien gestiona define los campos y las firmas, y el formulario sale solo en el
 * celular. En borrador se edita libre; publicada queda fija (se crea una versión nueva).
 */
export function EditorPlantilla({ inicial, gestiona }: { inicial: Plantilla; gestiona: boolean }) {
  const router = useRouter();
  const [p, setP] = useState(inicial);
  const [abierto, setAbierto] = useState<number | null>(null);
  const [vista, setVista] = useState<"armar" | "previa">("armar");
  const [previa, setPrevia] = useState<Record<string, unknown>>({});
  const [motivo, setMotivo] = useState("");
  const [archivando, setArchivando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  const editable = gestiona && p.estado === "borrador";
  const problema = problemaCampos(p.campos, p.firmas);
  const cambio = JSON.stringify([p.nombre, p.descripcion, p.campos, p.firmas]) !== JSON.stringify([inicial.nombre, inicial.descripcion, inicial.campos, inicial.firmas]);

  const poner = (cambios: Partial<Plantilla>) => {
    setAviso(null);
    setP((x) => ({ ...x, ...cambios }));
  };
  const ponerCampo = (i: number, cambios: Partial<Campo>) => poner({ campos: p.campos.map((c, j) => (j === i ? { ...c, ...cambios } : c)) });
  const mover = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= p.campos.length) return;
    const c = [...p.campos];
    [c[i], c[j]] = [c[j], c[i]];
    poner({ campos: c });
    setAbierto(j);
  };
  function agregar(tipo: TipoCampo) {
    const etiqueta = tipo === "seccion" ? "Nueva sección" : NOMBRE_TIPO[tipo];
    const nuevo: Campo = {
      id: idDesdeEtiqueta(etiqueta, p.campos.map((c) => c.id)),
      tipo,
      etiqueta,
      ...(tipo === "lista" ? { opciones: [] } : {}),
      ...(tipo === "tabla" ? { columnas: [] } : {}),
    };
    poner({ campos: [...p.campos, nuevo] });
    setAbierto(p.campos.length);
  }

  const guardar = (extra: Record<string, unknown> = {}, despues?: string) =>
    empezar(async () => {
      setError(null);
      const { data, error: e } = await createClient()
        .from("sst_plantillas")
        .update({ nombre: p.nombre.trim(), descripcion: p.descripcion?.trim() || null, campos: limpiar(p.campos), firmas: p.firmas, ...extra })
        .eq("id", p.id)
        .select("id");
      if (e) return setError(e.message);
      if (!data?.length) return setError("No se guardó: no tienes permiso para armar plantillas.");
      setAviso(despues ?? "Guardado.");
      router.refresh();
      if (extra.estado) setP((x) => ({ ...x, estado: extra.estado as Plantilla["estado"] }));
    });

  const nuevaVersion = () =>
    empezar(async () => {
      setError(null);
      const { data, error: e } = await createClient()
        .from("sst_plantillas")
        .insert({ codigo: p.codigo, nombre: p.nombre, descripcion: p.descripcion, campos: p.campos, firmas: p.firmas, plantilla_anterior_id: p.id })
        .select("id")
        .single();
      if (e) return setError(e.message);
      router.push(`${AMBITO[p.ambito].plantillas}/${data.id}`);
    });

  const archivar = () =>
    empezar(async () => {
      setError(null);
      const { data, error: e } = await createClient().from("sst_plantillas").update({ estado: "archivada", motivo_archivo: motivo.trim() }).eq("id", p.id).select("id");
      if (e) return setError(e.message);
      if (!data?.length) return setError("No se archivó: no tienes permiso.");
      router.refresh();
      setP((x) => ({ ...x, estado: "archivada", motivo_archivo: motivo.trim() }));
      setArchivando(false);
    });

  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs text-slate-500">
          {p.codigo} · versión {p.version} · {p.estado === "borrador" ? "Borrador" : p.estado === "publicada" ? "Publicada" : "Archivada"}
        </p>
        {editable ? (
          <input value={p.nombre} onChange={(e) => poner({ nombre: e.target.value })} className="w-full rounded-md border border-slate-300 px-2 py-1 text-lg font-bold" />
        ) : (
          <h1 className="text-lg font-bold text-slate-900">{p.nombre}</h1>
        )}
        {p.estado === "publicada" && <p className="text-sm text-slate-600">Publicada: ya se puede llenar en sitio. Para cambiarla, crea una versión nueva; lo ya llenado queda con esta.</p>}
        {p.estado === "archivada" && <p className="text-sm text-amber-800">Archivada: {p.motivo_archivo}. Ya no se ofrece para llenar; lo llenado se conserva.</p>}
        {!gestiona && <p className="text-sm text-slate-500">Solo lectura: armar plantillas lo hace {AMBITO[p.ambito].gestion}.</p>}
      </div>

      <div className="flex gap-2">
        {(["armar", "previa"] as const).map((v) => (
          <button key={v} type="button" onClick={() => setVista(v)} className={`min-h-11 rounded-full border px-4 text-sm font-medium ${vista === v ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300"}`}>
            {v === "armar" ? "Campos y firmas" : "Así se ve en el celular"}
          </button>
        ))}
      </div>

      {vista === "previa" ? (
        <div className="mx-auto max-w-sm rounded-2xl border-4 border-slate-800 bg-white p-3">
          <FormularioSst campos={p.campos} respuestas={previa} onCambio={(id, v) => setPrevia((x) => ({ ...x, [id]: v }))} />
          <div className="mt-4 space-y-2 border-t border-slate-200 pt-3">
            <p className="text-sm font-bold">Firmas</p>
            {p.firmas.map((f) => (
              <p key={f.rol + f.etiqueta} className="rounded-md border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-600">
                {f.etiqueta}
                {f.rol === "tecnico" ? " (una por cada técnico)" : ""}
                {f.obligatoria === false ? " · opcional" : ""}
              </p>
            ))}
          </div>
          <p className="mt-2 text-center text-xs text-slate-500">Vista previa: lo que escribas aquí no se guarda.</p>
        </div>
      ) : (
        <>
          <section className="rounded-lg border border-slate-200 bg-white p-3">
            <h2 className="mb-2 text-sm font-bold">Campos</h2>
            {p.campos.length === 0 && <p className="text-sm text-slate-500">Sin campos todavía. Agrégalos en el orden del documento.</p>}
            <ol className="space-y-2">
              {p.campos.map((c, i) => (
                <li key={i} className={`rounded-md border ${c.tipo === "seccion" ? "border-slate-400 bg-slate-50" : "border-slate-200"}`}>
                  <button type="button" onClick={() => setAbierto(abierto === i ? null : i)} className="flex min-h-11 w-full items-center gap-2 px-3 text-left text-sm">
                    <span className="w-6 shrink-0 text-xs text-slate-400">{i + 1}</span>
                    <span className={`min-w-0 flex-1 ${c.tipo === "seccion" ? "font-bold" : "font-medium"}`}>
                      {c.etiqueta}
                      {c.obligatorio && <span className="text-red-700"> *</span>}
                    </span>
                    <span className="shrink-0 text-xs text-slate-500">{NOMBRE_TIPO[c.tipo]}</span>
                  </button>
                  {abierto === i && (
                    <EditorCampo
                      c={c}
                      editable={editable}
                      onCambio={(x) => ponerCampo(i, x)}
                      onSubir={() => mover(i, -1)}
                      onBajar={() => mover(i, 1)}
                      onQuitar={() => {
                        poner({ campos: p.campos.filter((_, j) => j !== i) });
                        setAbierto(null);
                      }}
                    />
                  )}
                </li>
              ))}
            </ol>
            {editable && (
              <div className="mt-3">
                <p className="text-xs font-medium text-slate-600">Agregar un campo:</p>
                <div className="mt-1 grid grid-cols-2 gap-1 sm:grid-cols-4">
                  {TIPOS_CAMPO.map((t) => (
                    <button key={t.id} type="button" onClick={() => agregar(t.id)} className="min-h-11 rounded-md border border-slate-300 px-2 text-xs font-medium">
                      + {t.nombre}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-3">
            <h2 className="text-sm font-bold">Firmas de cierre</h2>
            <p className="mb-2 text-xs text-slate-500">
              Al firmar el primero, el contenido queda sellado: todos firman lo mismo. El bloque de técnicos es una lista: firman todos los que estuvieron en la obra.
            </p>
            <EditorFirmas ambito={p.ambito} firmas={p.firmas} editable={editable} onCambio={(firmas) => poner({ firmas })} />
          </section>

          {editable && (
            <label className="block text-sm font-medium">
              Notas para quien llena (opcional)
              <textarea value={p.descripcion ?? ""} onChange={(e) => poner({ descripcion: e.target.value })} rows={2} className={CAMPO} />
            </label>
          )}
        </>
      )}

      {gestiona && (
        <div className="space-y-2">
          {p.estado === "borrador" && (
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={pendiente || !cambio} onClick={() => guardar()} className="min-h-11 flex-1 rounded-md border border-slate-900 px-4 text-sm font-semibold disabled:opacity-40">
                Guardar borrador
              </button>
              <button
                type="button"
                disabled={pendiente || !!problema || p.firmas.length === 0}
                onClick={() => guardar({ estado: "publicada" }, "Publicada: ya se puede llenar en sitio.")}
                className="min-h-11 flex-1 rounded-md bg-green-700 px-4 text-sm font-semibold text-white disabled:opacity-40"
              >
                Publicar
              </button>
            </div>
          )}
          {p.estado === "borrador" && !cambio && !aviso && <p className="text-xs text-slate-500">Sin cambios por guardar.</p>}
          {p.estado === "borrador" && (problema || p.firmas.length === 0) && (
            <p className="text-sm text-slate-600">Para publicar: {problema ?? "pide al menos una firma."}</p>
          )}
          {p.estado === "publicada" && (
            <button type="button" disabled={pendiente} onClick={nuevaVersion} className="min-h-11 w-full rounded-md border border-slate-900 text-sm font-semibold">
              Crear versión {p.version + 1} para cambiarla
            </button>
          )}
          {p.estado !== "archivada" &&
            (archivando ? (
              <div className="space-y-1">
                <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} placeholder="Por qué se archiva" className={CAMPO} />
                <div className="flex gap-2">
                  <button type="button" onClick={() => setArchivando(false)} className="min-h-11 flex-1 rounded-md border border-slate-300 text-sm">
                    Cancelar
                  </button>
                  <button type="button" disabled={pendiente || !motivo.trim()} onClick={archivar} className="min-h-11 flex-1 rounded-md bg-slate-700 text-sm font-semibold text-white disabled:opacity-40">
                    Archivar
                  </button>
                </div>
                {!motivo.trim() && <p className="text-xs text-slate-500">Escribe por qué se archiva.</p>}
              </div>
            ) : (
              <button type="button" onClick={() => setArchivando(true)} className="min-h-11 w-full rounded-md border border-slate-300 text-sm text-slate-700">
                Archivar plantilla (deja de ofrecerse; lo llenado se conserva)
              </button>
            ))}
          {aviso && <p className="text-sm text-green-800">{aviso}</p>}
          {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
        </div>
      )}
    </div>
  );
}

function EditorCampo({
  c,
  editable,
  onCambio,
  onSubir,
  onBajar,
  onQuitar,
}: {
  c: Campo;
  editable: boolean;
  onCambio: (x: Partial<Campo>) => void;
  onSubir: () => void;
  onBajar: () => void;
  onQuitar: () => void;
}) {
  const dis = !editable;
  return (
    <div className="space-y-2 border-t border-slate-100 p-3">
      <label className="block text-xs font-medium text-slate-700">
        Nombre (como en el documento)
        <input disabled={dis} value={c.etiqueta} onChange={(e) => onCambio({ etiqueta: e.target.value })} className={CAMPO} />
      </label>
      {c.tipo !== "seccion" && (
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" disabled={dis} checked={!!c.obligatorio} onChange={(e) => onCambio({ obligatorio: e.target.checked })} className="h-5 w-5" />
          Obligatorio antes de firmar
        </label>
      )}
      <label className="block text-xs font-medium text-slate-700">
        Ayuda para quien llena (opcional)
        <input disabled={dis} value={c.ayuda ?? ""} onChange={(e) => onCambio({ ayuda: e.target.value || undefined })} className={CAMPO} />
      </label>
      {c.tipo === "lista" && (
        <>
          <label className="block text-xs font-medium text-slate-700">
            Opciones (una por línea)
            <textarea disabled={dis} value={(c.opciones ?? []).join("\n")} onChange={(e) => onCambio({ opciones: e.target.value.split("\n") })} rows={4} className={CAMPO} />
          </label>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" disabled={dis} checked={!!c.multiple} onChange={(e) => onCambio({ multiple: e.target.checked })} className="h-5 w-5" />
            Se puede marcar más de una
          </label>
        </>
      )}
      {c.tipo === "tabla" && <EditorColumnas c={c} dis={dis} onCambio={onCambio} />}
      <p className="text-xs text-slate-400">Identificador: {c.id}</p>
      {editable && (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onSubir} className="min-h-11 rounded-md border border-slate-300 px-3 text-xs">
            ↑ Subir
          </button>
          <button type="button" onClick={onBajar} className="min-h-11 rounded-md border border-slate-300 px-3 text-xs">
            ↓ Bajar
          </button>
          <button type="button" onClick={onQuitar} className="min-h-11 rounded-md border border-red-300 px-3 text-xs text-red-800">
            Quitar campo
          </button>
        </div>
      )}
    </div>
  );
}

function EditorColumnas({ c, dis, onCambio }: { c: Campo; dis: boolean; onCambio: (x: Partial<Campo>) => void }) {
  const cols = c.columnas ?? [];
  const poner = (i: number, x: Partial<NonNullable<Campo["columnas"]>[number]>) => onCambio({ columnas: cols.map((col, j) => (j === i ? { ...col, ...x } : col)) });
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-slate-700">Columnas de la tabla</p>
      {cols.map((col, i) => (
        <div key={i} className="space-y-1 rounded-md border border-slate-200 p-2">
          <div className="flex gap-2">
            <input disabled={dis} value={col.etiqueta} onChange={(e) => poner(i, { etiqueta: e.target.value })} placeholder="Nombre de la columna" className="min-w-0 flex-1 rounded-md border border-slate-300 px-2 py-1 text-sm" />
            <select disabled={dis} value={col.tipo} onChange={(e) => poner(i, { tipo: e.target.value as TipoColumna })} className="rounded-md border border-slate-300 px-1 text-sm">
              {TIPOS_COLUMNA.map((t) => (
                <option key={t} value={t}>
                  {NOMBRE_TIPO[t]}
                </option>
              ))}
            </select>
          </div>
          {col.tipo === "lista" && (
            <textarea disabled={dis} value={(col.opciones ?? []).join("\n")} onChange={(e) => poner(i, { opciones: e.target.value.split("\n") })} rows={3} placeholder="Opciones, una por línea" className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm" />
          )}
          {!dis && (
            <button type="button" onClick={() => onCambio({ columnas: cols.filter((_, j) => j !== i) })} className="min-h-9 text-xs text-red-800 underline">
              Quitar columna
            </button>
          )}
        </div>
      ))}
      {!dis && (
        <button
          type="button"
          onClick={() => onCambio({ columnas: [...cols, { id: idDesdeEtiqueta(`columna ${cols.length + 1}`, cols.map((x) => x.id)), tipo: "texto", etiqueta: "" }] })}
          className="min-h-11 rounded-md border border-dashed border-slate-400 px-3 text-xs font-medium"
        >
          + Columna
        </button>
      )}
    </div>
  );
}

function EditorFirmas({ ambito, firmas, editable, onCambio }: { ambito: Ambito; firmas: FirmaPedida[]; editable: boolean; onCambio: (f: FirmaPedida[]) => void }) {
  const roles = rolesFirma(ambito);
  const poner = (i: number, x: Partial<FirmaPedida>) => onCambio(firmas.map((f, j) => (j === i ? { ...f, ...x } : f)));
  return (
    <div className="space-y-2">
      {firmas.map((f, i) => (
        <div key={i} className="space-y-1 rounded-md border border-slate-200 p-2">
          <input disabled={!editable} value={f.etiqueta} onChange={(e) => poner(i, { etiqueta: e.target.value })} className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm font-medium" />
          <p className="text-xs text-slate-500">{roles.find((r) => r.id === f.rol)?.nombre}</p>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" disabled={!editable} checked={f.obligatoria !== false} onChange={(e) => poner(i, { obligatoria: e.target.checked })} className="h-5 w-5" />
            Obligatoria para cerrar {AMBITO[ambito].documento === "acta" ? "el acta" : "el formato"}
          </label>
          {editable && (
            <button type="button" onClick={() => onCambio(firmas.filter((_, j) => j !== i))} className="min-h-9 text-xs text-red-800 underline">
              Quitar bloque
            </button>
          )}
        </div>
      ))}
      {editable && (
        <div className="flex flex-wrap gap-1">
          {roles.filter((r) => r.id === "otro" || !firmas.some((f) => f.rol === r.id)).map((r) => (
            <button key={r.id} type="button" onClick={() => onCambio([...firmas, { rol: r.id, etiqueta: r.nombre, obligatoria: true }])} className="min-h-11 rounded-md border border-dashed border-slate-400 px-3 text-xs">
              + {r.nombre}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
