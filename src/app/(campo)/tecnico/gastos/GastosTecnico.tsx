"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { AbrirArchivo, ElegirArchivo, subirSoporte } from "@/components/rrhh/archivos";
import { CAMPO, ETIQUETA, TARJETA } from "@/components/rrhh/PantallaPerfil";
import {
  CATEGORIA,
  CATEGORIAS_COMPRA,
  ESTADO_GASTO,
  PAGADO_CON,
  fechaCorta,
  leerMonto,
  pesos,
  type CategoriaCosto,
  type Gasto,
  type PagadoCon,
  type TipoGasto,
} from "@/lib/rrhh-registros";

type Proyecto = { id: string; codigo: string; nombre: string };

interface Borrador {
  id: string | null;
  tipo: TipoGasto;
  categoria: Exclude<CategoriaCosto, "TRANSPORTE">;
  fecha: string;
  monto: string;
  descripcion: string;
  proveedor: string;
  factura: string;
  origen: string;
  destino: string;
  pagadoCon: PagadoCon | "";
  proyectoId: string;
  /** Proyecto que asignó RRHH y no está en la lista del técnico: se respeta, no se toca. */
  proyectoFijo: string | null;
}

const nuevo = (hoy: string, tipo: TipoGasto): Borrador => ({
  id: null,
  tipo,
  categoria: "MATERIAL",
  fecha: hoy,
  monto: "",
  descripcion: "",
  proveedor: "",
  factura: "",
  origen: "",
  destino: "",
  pagadoCon: "",
  proyectoId: "",
  proyectoFijo: null,
});

export function GastosTecnico({
  yo,
  hoy,
  gastos,
  proyectos,
}: {
  yo: string;
  hoy: string;
  gastos: Gasto[];
  proyectos: Proyecto[];
}) {
  const router = useRouter();
  const [b, setB] = useState<Borrador | null>(null);
  const [archivos, setArchivos] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  const nombreProyecto = new Map(proyectos.map((p) => [p.id, `${p.nombre} (${p.codigo})`]));

  const cambiar = <K extends keyof Borrador>(k: K, v: Borrador[K]) => setB((p) => (p ? { ...p, [k]: v } : p));
  const monto = b ? leerMonto(b.monto) : null;
  const falta = !b
    ? null
    : !b.descripcion.trim()
      ? b.tipo === "compra"
        ? "Falta qué compraste."
        : "Falta para qué fue el transporte."
      : monto === null
        ? "Falta el valor."
        : !b.fecha
          ? "Falta la fecha."
          : b.fecha > hoy
            ? "La fecha no puede ser futura."
            : !b.pagadoCon
              ? "Falta quién pagó: tú o la empresa."
              : null;

  function guardar() {
    if (!b || falta) return;
    setError(null);
    empezar(async () => {
      const supabase = createClient();
      const fila = {
        tipo: b.tipo,
        categoria_costo: b.tipo === "transporte" ? "TRANSPORTE" : b.categoria,
        fecha: b.fecha,
        monto,
        descripcion: b.descripcion.trim(),
        proveedor: b.proveedor.trim() || null,
        numero_factura: b.factura.trim() || null,
        origen: b.tipo === "transporte" ? b.origen.trim() || null : null,
        destino: b.tipo === "transporte" ? b.destino.trim() || null : null,
        pagado_con: b.pagadoCon,
        ...(b.proyectoFijo ? {} : { proyecto_id: b.proyectoId || null }),
      };
      let id = b.id;
      if (id) {
        const { error: e } = await supabase.from("gastos").update(fila).eq("id", id);
        if (e) return setError(e.message);
      } else {
        const { data, error: e } = await supabase.from("gastos").insert({ ...fila, persona_id: yo }).select("id").single();
        if (e) return setError(e.message);
        id = data.id;
      }
      const fallidos = await adjuntar(id!, archivos);
      setB(null);
      setArchivos([]);
      setAviso(
        fallidos > 0
          ? `El gasto quedó guardado, pero ${fallidos === 1 ? "un archivo no se subió" : `${fallidos} archivos no se subieron`}. Vuelve a adjuntarlo desde el gasto.`
          : b.id
            ? "Gasto corregido. RRHH lo ve como registrado otra vez."
            : "Gasto guardado.",
      );
      router.refresh();
    });
  }

  async function adjuntar(gastoId: string, lista: File[]): Promise<number> {
    let fallidos = 0;
    for (const f of lista) {
      try {
        const s = await subirSoporte(`gastos/${gastoId}`, f);
        const { error: e } = await createClient()
          .from("gasto_soportes")
          .insert({ gasto_id: gastoId, storage_path: s.path, nombre_archivo: s.nombre, mime: s.mime, bytes: s.bytes, subido_por: yo });
        if (e) throw e;
      } catch (e) {
        fallidos++;
        setError(e instanceof Error ? e.message : String(e));
      }
    }
    return fallidos;
  }

  if (b) {
    return (
      <div className={`${TARJETA} space-y-3`}>
        <div className="grid grid-cols-2 gap-2">
          {(["compra", "transporte"] as const).map((t) => (
            <button
              key={t}
              type="button"
              disabled={!!b.id}
              onClick={() => cambiar("tipo", t)}
              className={`min-h-11 rounded-lg border-2 text-sm font-semibold ${
                b.tipo === t ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 text-slate-700"
              } disabled:opacity-60`}
            >
              {t === "compra" ? "🧾 Compra de material" : "🚕 Transporte adicional"}
            </button>
          ))}
        </div>
        {b.id && <p className="text-xs text-slate-500">El tipo no se cambia al corregir: si te equivocaste, anúlalo y regístralo de nuevo.</p>}

        <div>
          <label className={ETIQUETA}>{b.tipo === "compra" ? "Qué compraste *" : "Para qué fue *"}</label>
          <input
            value={b.descripcion}
            onChange={(e) => cambiar("descripcion", e.target.value)}
            placeholder={b.tipo === "compra" ? "Ej. 20 m de cable 12 AWG" : "Ej. Taxi con la escalera a la obra"}
            className={CAMPO}
          />
        </div>
        {b.tipo === "transporte" && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={ETIQUETA}>Desde</label>
              <input value={b.origen} onChange={(e) => cambiar("origen", e.target.value)} placeholder="Bodega" className={CAMPO} />
            </div>
            <div>
              <label className={ETIQUETA}>Hasta</label>
              <input value={b.destino} onChange={(e) => cambiar("destino", e.target.value)} placeholder="Obra" className={CAMPO} />
            </div>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={ETIQUETA}>Valor *</label>
            <input value={b.monto} onChange={(e) => cambiar("monto", e.target.value)} inputMode="numeric" placeholder="$ 0" className={CAMPO} />
            {monto !== null && <p className="text-xs text-slate-500">{pesos(monto)}</p>}
          </div>
          <div>
            <label className={ETIQUETA}>Fecha *</label>
            <input type="date" value={b.fecha} max={hoy} onChange={(e) => cambiar("fecha", e.target.value)} className={CAMPO} />
          </div>
        </div>
        {b.tipo === "compra" && (
          <div>
            <label className={ETIQUETA}>Qué es</label>
            <select value={b.categoria} onChange={(e) => cambiar("categoria", e.target.value as Borrador["categoria"])} className={CAMPO}>
              {CATEGORIAS_COMPRA.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </div>
        )}
        {b.tipo === "compra" && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={ETIQUETA}>Dónde (proveedor)</label>
              <input value={b.proveedor} onChange={(e) => cambiar("proveedor", e.target.value)} className={CAMPO} />
            </div>
            <div>
              <label className={ETIQUETA}>N.º de factura</label>
              <input value={b.factura} onChange={(e) => cambiar("factura", e.target.value)} className={CAMPO} />
            </div>
          </div>
        )}
        <div>
          <label className={ETIQUETA}>Quién pagó *</label>
          <div className="mt-0.5 grid grid-cols-2 gap-2">
            {(["propio", "empresa"] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => cambiar("pagadoCon", p)}
                className={`min-h-11 rounded-lg border-2 px-2 text-sm font-semibold ${
                  b.pagadoCon === p ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 text-slate-700"
                }`}
              >
                {PAGADO_CON[p]}
              </button>
            ))}
          </div>
          {b.pagadoCon === "propio" && <p className="mt-1 text-xs text-slate-500">RRHH lo tiene en cuenta para devolvértelo.</p>}
        </div>
        {b.proyectoFijo ? (
          <div>
            <label className={ETIQUETA}>Proyecto u obra</label>
            <p className="mt-0.5 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">{b.proyectoFijo}</p>
            <p className="mt-1 text-xs text-slate-500">Lo asignó RRHH: si no es ese, díselo a RRHH.</p>
          </div>
        ) : (
        <div>
          <label className={ETIQUETA}>Proyecto u obra</label>
          <select value={b.proyectoId} onChange={(e) => cambiar("proyectoId", e.target.value)} className={CAMPO}>
            <option value="">Sin proyecto — RRHH lo asigna</option>
            {proyectos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre} ({p.codigo})
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-slate-500">
            {proyectos.length === 0
              ? "No tienes obras asignadas en este momento. Guárdalo sin proyecto: RRHH lo asigna."
              : "Si no sabes de qué obra es, déjalo sin proyecto: RRHH lo asigna."}
          </p>
        </div>
        )}

        <div>
          <label className={ETIQUETA}>Factura o recibo (foto o PDF)</label>
          <div className="mt-0.5">
            <ElegirArchivo onElegido={(f) => setArchivos((a) => [...a, f])} />
          </div>
          {archivos.length > 0 && (
            <ul className="mt-1 space-y-0.5 text-sm">
              {archivos.map((f, i) => (
                <li key={i} className="flex items-center justify-between gap-2">
                  <span className="truncate">📎 {f.name}</span>
                  <button type="button" onClick={() => setArchivos((a) => a.filter((_, j) => j !== i))} className="text-xs font-semibold underline">
                    Quitar
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => {
              setB(null);
              setArchivos([]);
              setError(null);
            }}
            className="min-h-11 rounded-lg border-2 border-slate-300 text-sm font-semibold"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={guardar}
            disabled={pendiente || falta !== null}
            className="min-h-11 rounded-lg bg-slate-900 text-sm font-semibold text-white disabled:opacity-40"
          >
            {pendiente ? "Guardando…" : b.id ? "Guardar corrección" : "Guardar gasto"}
          </button>
        </div>
        {falta && !pendiente && <p className="text-center text-xs text-slate-500">{falta}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => {
            setAviso(null);
            setB(nuevo(hoy, "compra"));
          }}
          className="min-h-11 rounded-lg bg-slate-900 px-2 text-sm font-semibold text-white"
        >
          + Compra de material
        </button>
        <button
          type="button"
          onClick={() => {
            setAviso(null);
            setB(nuevo(hoy, "transporte"));
          }}
          className="min-h-11 rounded-lg bg-slate-900 px-2 text-sm font-semibold text-white"
        >
          + Transporte
        </button>
      </div>
      {aviso && <p className="rounded-lg bg-slate-800 px-3 py-2 text-sm text-white">{aviso}</p>}
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}

      {gastos.length === 0 ? (
        <p className="text-sm text-slate-500">Todavía no has registrado gastos.</p>
      ) : (
        <ul className="space-y-2">
          {gastos.map((g) => (
            <FilaGasto
              key={g.id}
              g={g}
              proyecto={g.proyecto_id ? (nombreProyecto.get(g.proyecto_id) ?? "Proyecto asignado por RRHH") : null}
              pendiente={pendiente}
              onCorregir={() =>
                setB({
                  id: g.id,
                  tipo: g.tipo,
                  categoria: g.categoria_costo === "TRANSPORTE" ? "MATERIAL" : g.categoria_costo,
                  fecha: g.fecha,
                  monto: String(Math.round(Number(g.monto))),
                  descripcion: g.descripcion,
                  proveedor: g.proveedor ?? "",
                  factura: g.numero_factura ?? "",
                  origen: g.origen ?? "",
                  destino: g.destino ?? "",
                  pagadoCon: g.pagado_con,
                  proyectoId: g.proyecto_id && nombreProyecto.has(g.proyecto_id) ? g.proyecto_id : "",
                  proyectoFijo: g.proyecto_id && !nombreProyecto.has(g.proyecto_id) ? "Proyecto asignado por RRHH" : null,
                })
              }
              onAdjuntar={(f) =>
                empezar(async () => {
                  setError(null);
                  const fallidos = await adjuntar(g.id, [f]);
                  if (fallidos === 0) setAviso("Archivo adjuntado.");
                  router.refresh();
                })
              }
              onAnular={() =>
                empezar(async () => {
                  if (!window.confirm("¿Anular este gasto? No se borra: queda anulado y RRHH lo ve así.")) return;
                  setError(null);
                  const { error: e } = await createClient().from("gastos").update({ estado: "anulado" }).eq("id", g.id);
                  if (e) return setError(e.message);
                  setAviso("Gasto anulado.");
                  router.refresh();
                })
              }
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function FilaGasto({
  g,
  proyecto,
  pendiente,
  onCorregir,
  onAdjuntar,
  onAnular,
}: {
  g: Gasto;
  proyecto: string | null;
  pendiente: boolean;
  onCorregir: () => void;
  onAdjuntar: (f: File) => void;
  onAnular: () => void;
}) {
  const [adjuntando, setAdjuntando] = useState(false);
  const reembolsado = !!g.reembolsado_en;
  const editable = g.estado !== "anulado" && !reembolsado;
  return (
    <li className={`${TARJETA} ${g.estado === "anulado" ? "opacity-60" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-base font-semibold text-slate-900">{g.descripcion}</p>
          <p className="text-sm text-slate-600">
            {g.tipo === "transporte" ? "Transporte" : CATEGORIA[g.categoria_costo]} · {fechaCorta(g.fecha)} · {PAGADO_CON[g.pagado_con]}
          </p>
          <p className="text-sm text-slate-600">{proyecto ?? "Sin proyecto — RRHH lo asigna"}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-base font-bold">{pesos(Number(g.monto))}</p>
          <p className={`text-xs font-semibold ${g.estado === "observado" ? "text-amber-700" : "text-slate-500"}`}>
            {reembolsado ? "Reembolsado" : ESTADO_GASTO[g.estado]}
          </p>
        </div>
      </div>
      {g.estado === "observado" && g.observacion && (
        <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <span className="font-semibold">RRHH pide corregir:</span> {g.observacion}
        </p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        {g.gasto_soportes.length === 0 ? (
          <span className="text-amber-700">Sin factura adjunta</span>
        ) : (
          g.gasto_soportes.map((s, i) => (
            <AbrirArchivo key={s.id} path={s.storage_path}>
              📎 Factura {g.gasto_soportes.length > 1 ? i + 1 : ""}
            </AbrirArchivo>
          ))
        )}
      </div>
      {editable && (
        <div className="mt-2 space-y-2 border-t border-slate-100 pt-2">
          {adjuntando ? (
            <ElegirArchivo
              onElegido={(f) => {
                setAdjuntando(false);
                onAdjuntar(f);
              }}
            />
          ) : (
            <div className="grid grid-cols-3 gap-2">
              <button type="button" disabled={pendiente} onClick={onCorregir} className="min-h-9 rounded-lg border border-slate-400 text-sm font-semibold disabled:opacity-40">
                {g.estado === "observado" ? "Corregir" : "Editar"}
              </button>
              <button type="button" disabled={pendiente} onClick={() => setAdjuntando(true)} className="min-h-9 rounded-lg border border-slate-400 text-sm font-semibold disabled:opacity-40">
                Adjuntar
              </button>
              <button type="button" disabled={pendiente} onClick={onAnular} className="min-h-9 rounded-lg border border-red-300 text-sm font-semibold text-red-800 disabled:opacity-40">
                Anular
              </button>
            </div>
          )}
        </div>
      )}
      {reembolsado && <p className="mt-2 text-xs text-slate-500">Ya te lo devolvieron: no se edita.</p>}
    </li>
  );
}
