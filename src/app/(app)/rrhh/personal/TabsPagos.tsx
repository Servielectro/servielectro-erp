"use client";

// Sueldo/liquidación, Desprendible y Caja menor. CAPTURA, no cálculo: "la señora Alejandra hace
// eso y sube al sistema". Los valores son los que ella escribe de su liquidación; el sistema
// solo suma las líneas de un recibo de caja menor (aritmética, no ley). Lo registrado no se
// edita: se anula con motivo y se registra de nuevo (lo exige la base, migración 66).

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { AbrirArchivo, BUCKET_PERSONAL, ElegirArchivo, subirSoporte } from "@/components/rrhh/archivos";
import { BUCKET_SOPORTES, fechaCorta, leerMonto, pesos } from "@/lib/rrhh-registros";
import { Bloque } from "./TabDatos";

const C = "mt-0.5 block w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm";
const L = "block text-xs text-slate-600";
const BOTON = "min-h-9 rounded-md bg-slate-900 px-3 text-xs font-semibold text-white disabled:opacity-40";
const BOTON2 = "min-h-9 rounded-md border border-slate-300 px-3 text-xs font-semibold disabled:opacity-40";

async function ok<T>(p: PromiseLike<{ error: { message: string } | null; data?: T | null }>): Promise<T> {
  const r = await p;
  if (r.error) throw new Error(r.error.message);
  return r.data as T;
}

/**
 * Sube el archivo. Si se publica y la ficha tiene usuario, va como documento con destinatario
 * (migración 64): le aparece solo a esa persona en "Documentos y certificados".
 */
async function guardarArchivo(
  archivo: File,
  empleadoId: string,
  carpeta: string,
  publicar: { perfilId: string; tipo: "desprendible" | "liquidacion"; titulo: string; inicio: string; fin: string } | null,
): Promise<{ path: string; documentoId: string | null }> {
  if (!publicar) {
    const s = await subirSoporte(`personal/${empleadoId}/${carpeta}`, archivo, BUCKET_PERSONAL);
    return { path: s.path, documentoId: null };
  }
  const s = await subirSoporte(`documentos/${publicar.perfilId}`, archivo, BUCKET_SOPORTES);
  const doc = await ok<{ id: string }>(
    createClient()
      .from("documentos_personal")
      .insert({
        persona_id: publicar.perfilId,
        tipo: publicar.tipo,
        titulo: publicar.titulo,
        periodo_inicio: publicar.inicio || null,
        periodo_fin: publicar.fin || null,
        storage_path: s.path,
        nombre_archivo: s.nombre,
        mime: s.mime,
        bytes: s.bytes,
      })
      .select("id")
      .single(),
  );
  return { path: s.path, documentoId: doc.id };
}

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
        const m = await fn();
        if (m) setAviso(m);
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

const AvisoCaptura = () => (
  <p className="rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-900">
    El sistema no calcula la nómina ni la liquidación: escribe los valores de la liquidación que hiciste y sube el archivo. Queda en el historial.
  </p>
);

function Dinero({ etiqueta, valor, onCambio }: { etiqueta: string; valor: string; onCambio: (v: string) => void }) {
  const n = leerMonto(valor);
  return (
    <label className={L}>
      {etiqueta}
      <input value={valor} onChange={(e) => onCambio(e.target.value)} inputMode="numeric" placeholder="$ 0" className={C} />
      {n !== null && <span className="text-xs text-slate-500">{pesos(n)}</span>}
    </label>
  );
}

function Anular({ tabla, id }: { tabla: "liquidaciones" | "desprendibles" | "caja_menor_recibos"; id: string }) {
  const { correr, pendiente, mensajes } = useAccion();
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState("");
  if (!abierto)
    return (
      <button type="button" onClick={() => setAbierto(true)} className={`${BOTON2} text-red-800`}>
        Anular…
      </button>
    );
  return (
    <div className="mt-1 w-full space-y-1">
      <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Por qué se anula" className={C} />
      <div className="flex gap-2">
        <button type="button" onClick={() => setAbierto(false)} className={`${BOTON2} flex-1`}>
          Cancelar
        </button>
        <button
          type="button"
          disabled={pendiente || !motivo.trim()}
          onClick={() => correr(async () => (await ok(createClient().from(tabla).update({ motivo_anulacion: motivo.trim() }).eq("id", id)), "Anulado."))}
          className="min-h-9 flex-1 rounded-md bg-red-700 text-xs font-semibold text-white disabled:opacity-40"
        >
          Anular
        </button>
      </div>
      {!motivo.trim() && <p className="text-xs text-slate-500">Escribe por qué se anula.</p>}
      {mensajes}
    </div>
  );
}

function Archivo({ path, documentoId }: { path: string | null; documentoId: string | null }) {
  if (!path) return <span className="text-xs text-amber-700">Sin archivo</span>;
  return (
    <>
      <AbrirArchivo bucket={documentoId ? BUCKET_SOPORTES : BUCKET_PERSONAL} path={path}>
        📎 Archivo
      </AbrirArchivo>
      {documentoId && <span className="text-xs text-green-700"> · publicado a la persona</span>}
    </>
  );
}

function Publicar({ perfilId, publicar, setPublicar }: { perfilId: string | null; publicar: boolean; setPublicar: (v: boolean) => void }) {
  if (!perfilId)
    return <p className="text-xs text-slate-500">Para que la persona lo vea en su perfil, enlaza la ficha con su usuario (pestaña Accesos).</p>;
  return (
    <label className="flex items-center gap-2 text-xs text-slate-700">
      <input type="checkbox" checked={publicar} onChange={(e) => setPublicar(e.target.checked)} />
      Publicarlo a la persona (le aparece en “Documentos y certificados”, solo a ella)
    </label>
  );
}

const EnviarCorreo = () => (
  <span className="text-xs text-slate-500">
    “Enviar al correo del colaborador” todavía no está: el ERP no tiene correo configurado. Publícalo a la persona y le aparece en su perfil.
  </span>
);

// ============================================================ Sueldo / liquidación
export interface Liquidacion {
  id: string;
  tipo: string;
  fecha_inicio: string;
  fecha_corte: string;
  dias_laborados: number | null;
  dias_base: number | null;
  sueldo_dias: number | null;
  auxilio_transporte: number | null;
  total_devengado: number | null;
  aporte_salud: number | null;
  aporte_pension: number | null;
  neto_pagar: number | null;
  notas: string | null;
  archivo_path: string | null;
  documento_id: string | null;
  registrado_en: string;
  anulado_en: string | null;
  motivo_anulacion: string | null;
  liquidacion_lineas: { seccion: string; concepto: string; cantidad: number | null; valor: number | null }[];
}
type Linea = { seccion: "extras_recargos" | "ausencias" | "extra_no_salarial"; concepto: string; cantidad: string; valor: string };
const SECCIONES: { id: Linea["seccion"]; nombre: string; ejemplo: string }[] = [
  { id: "extras_recargos", nombre: "Horas extras y recargos", ejemplo: "Hora extra diurna" },
  { id: "ausencias", nombre: "Licencias, permisos y ausencias", ejemplo: "Permiso no remunerado" },
  { id: "extra_no_salarial", nombre: "Valor extra no salarial", ejemplo: "Auxilio de alimentación" },
];

export function TabSueldo({ empleadoId, perfilId, liquidaciones, salario }: { empleadoId: string; perfilId: string | null; liquidaciones: Liquidacion[]; salario: number }) {
  const { correr, pendiente, mensajes } = useAccion();
  const [tipo, setTipo] = useState("periodo");
  const [inicio, setInicio] = useState("");
  const [corte, setCorte] = useState("");
  const [dias, setDias] = useState("");
  const [diasBase, setDiasBase] = useState("");
  const [v, setV] = useState({ sueldo: "", auxilio: "", devengado: "", salud: "", pension: "", neto: "" });
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [abierta, setAbierta] = useState<Linea["seccion"] | null>(null);
  const [notas, setNotas] = useState("");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [publicar, setPublicar] = useState(false);
  const falta = !inicio || !corte ? "Elige la fecha de inicio y la de corte." : corte < inicio ? "El corte no puede ser antes del inicio." : null;

  return (
    <div className="space-y-3">
      <AvisoCaptura />
      <Bloque titulo="Liquidar periodo / retiro">
        <p className="mb-2 text-xs text-slate-500">Salario base en la ficha: {pesos(Number(salario))}.</p>
        <div className="grid grid-cols-2 gap-2">
          <label className={L}>
            Tipo
            <select value={tipo} onChange={(e) => setTipo(e.target.value)} className={C}>
              <option value="periodo">Periodo</option>
              <option value="retiro">Retiro</option>
            </select>
          </label>
          <span />
          <label className={L}>
            Fecha de inicio
            <input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} className={C} />
          </label>
          <label className={L}>
            Fecha de corte
            <input type="date" value={corte} min={inicio || undefined} onChange={(e) => setCorte(e.target.value)} className={C} />
          </label>
          <label className={L}>
            Días laborados
            <input value={dias} onChange={(e) => setDias(e.target.value)} inputMode="decimal" className={C} />
          </label>
          <label className={L}>
            Días base (mes)
            <input value={diasBase} onChange={(e) => setDiasBase(e.target.value)} inputMode="decimal" className={C} />
          </label>
        </div>

        {SECCIONES.map((s) => (
          <div key={s.id} className="mt-2 rounded-md border border-slate-200">
            <button type="button" onClick={() => setAbierta(abierta === s.id ? null : s.id)} className="flex min-h-9 w-full items-center justify-between px-2 text-left text-xs font-semibold">
              {s.nombre} ({lineas.filter((l) => l.seccion === s.id).length})<span>{abierta === s.id ? "▲" : "▼"}</span>
            </button>
            {abierta === s.id && (
              <div className="space-y-1 p-2">
                {lineas.map((l, i) =>
                  l.seccion !== s.id ? null : (
                    <div key={i} className="grid grid-cols-[1fr_4rem_6rem_auto] gap-1">
                      <input value={l.concepto} onChange={(e) => setLineas(lineas.map((x, j) => (j === i ? { ...x, concepto: e.target.value } : x)))} placeholder={s.ejemplo} className={C} />
                      <input value={l.cantidad} onChange={(e) => setLineas(lineas.map((x, j) => (j === i ? { ...x, cantidad: e.target.value } : x)))} placeholder="Cant." inputMode="decimal" className={C} />
                      <input value={l.valor} onChange={(e) => setLineas(lineas.map((x, j) => (j === i ? { ...x, valor: e.target.value } : x)))} placeholder="Valor" inputMode="numeric" className={C} />
                      <button type="button" onClick={() => setLineas(lineas.filter((_, j) => j !== i))} className="px-2 text-xs underline">
                        Quitar
                      </button>
                    </div>
                  ),
                )}
                <button type="button" onClick={() => setLineas([...lineas, { seccion: s.id, concepto: "", cantidad: "", valor: "" }])} className={BOTON2}>
                  + Agregar línea
                </button>
              </div>
            )}
          </div>
        ))}

        <div className="mt-2 grid grid-cols-2 gap-2">
          <Dinero etiqueta="Sueldo de días trabajados" valor={v.sueldo} onCambio={(x) => setV({ ...v, sueldo: x })} />
          <Dinero etiqueta="Auxilio de transporte" valor={v.auxilio} onCambio={(x) => setV({ ...v, auxilio: x })} />
          <Dinero etiqueta="Total devengado" valor={v.devengado} onCambio={(x) => setV({ ...v, devengado: x })} />
          <span />
          <Dinero etiqueta="Aporte salud (EPS) del trabajador" valor={v.salud} onCambio={(x) => setV({ ...v, salud: x })} />
          <Dinero etiqueta="Aporte pensión del trabajador" valor={v.pension} onCambio={(x) => setV({ ...v, pension: x })} />
          <Dinero etiqueta="Neto a pagar" valor={v.neto} onCambio={(x) => setV({ ...v, neto: x })} />
        </div>
        <label className={`${L} mt-2`}>
          Notas
          <input value={notas} onChange={(e) => setNotas(e.target.value)} className={C} />
        </label>
        <div className="mt-2 space-y-1">
          {archivo ? (
            <p className="text-xs">
              📎 {archivo.name}{" "}
              <button type="button" onClick={() => setArchivo(null)} className="underline">
                Quitar
              </button>
            </p>
          ) : (
            <ElegirArchivo onElegido={setArchivo} textoFoto="📷 Foto" textoArchivo="PDF de la liquidación" />
          )}
          <Publicar perfilId={perfilId} publicar={publicar} setPublicar={setPublicar} />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={pendiente || falta !== null}
            onClick={() =>
              correr(async () => {
                const subida = archivo
                  ? await guardarArchivo(
                      archivo,
                      empleadoId,
                      "liquidaciones",
                      publicar && perfilId ? { perfilId, tipo: "liquidacion", titulo: `Liquidación ${fechaCorta(inicio)} – ${fechaCorta(corte)}`, inicio, fin: corte } : null,
                    )
                  : null;
                const liq = await ok<{ id: string }>(
                  createClient()
                    .from("liquidaciones")
                    .insert({
                      empleado_id: empleadoId,
                      tipo,
                      fecha_inicio: inicio,
                      fecha_corte: corte,
                      dias_laborados: dias.trim() ? Number(dias.replace(",", ".")) : null,
                      dias_base: diasBase.trim() ? Number(diasBase.replace(",", ".")) : null,
                      sueldo_dias: leerMonto(v.sueldo),
                      auxilio_transporte: leerMonto(v.auxilio),
                      total_devengado: leerMonto(v.devengado),
                      aporte_salud: leerMonto(v.salud),
                      aporte_pension: leerMonto(v.pension),
                      neto_pagar: leerMonto(v.neto),
                      notas: notas.trim() || null,
                      archivo_path: subida?.path ?? null,
                      documento_id: subida?.documentoId ?? null,
                    })
                    .select("id")
                    .single(),
                );
                const filas = lineas
                  .filter((l) => l.concepto.trim())
                  .map((l, i) => ({
                    liquidacion_id: liq.id,
                    seccion: l.seccion,
                    concepto: l.concepto.trim(),
                    cantidad: l.cantidad.trim() ? Number(l.cantidad.replace(",", ".")) : null,
                    valor: leerMonto(l.valor),
                    orden: i,
                  }));
                if (filas.length) await ok(createClient().from("liquidacion_lineas").insert(filas));
                setLineas([]);
                setArchivo(null);
                setV({ sueldo: "", auxilio: "", devengado: "", salud: "", pension: "", neto: "" });
                return "Liquidación registrada.";
              })
            }
            className={BOTON}
          >
            Registrar liquidación
          </button>
          <EnviarCorreo />
        </div>
        {falta && <p className="mt-1 text-xs text-slate-500">{falta}</p>}
      </Bloque>

      <Bloque titulo="Historial de liquidaciones">
        <ul className="space-y-2">
          {liquidaciones.length === 0 && <li className="text-xs text-slate-500">Sin liquidaciones registradas.</li>}
          {liquidaciones.map((l) => (
            <li key={l.id} className={`rounded-md border border-slate-200 p-2 text-sm ${l.anulado_en ? "opacity-60" : ""}`}>
              <div className="flex justify-between gap-2">
                <p className="font-semibold">
                  {l.tipo === "retiro" ? "Retiro" : "Periodo"} {fechaCorta(l.fecha_inicio)} → {fechaCorta(l.fecha_corte)}
                  {l.dias_laborados !== null ? ` · ${Number(l.dias_laborados)} días` : ""}
                </p>
                <p className="shrink-0 font-bold">{l.neto_pagar !== null ? pesos(Number(l.neto_pagar)) : "—"}</p>
              </div>
              <p className="text-xs text-slate-600">
                Devengado {l.total_devengado !== null ? pesos(Number(l.total_devengado)) : "—"} · salud {l.aporte_salud !== null ? pesos(Number(l.aporte_salud)) : "—"} ·
                pensión {l.aporte_pension !== null ? pesos(Number(l.aporte_pension)) : "—"}
                {l.liquidacion_lineas.length ? ` · ${l.liquidacion_lineas.length} líneas` : ""}
              </p>
              {l.anulado_en && <p className="text-xs text-red-800">Anulada: {l.motivo_anulacion}</p>}
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <Archivo path={l.archivo_path} documentoId={l.documento_id} />
                {!l.anulado_en && <Anular tabla="liquidaciones" id={l.id} />}
              </div>
            </li>
          ))}
        </ul>
      </Bloque>
      {mensajes}
    </div>
  );
}

// ============================================================ Desprendible
export interface Desprendible {
  id: string;
  fecha_pago: string;
  medio_pago: string | null;
  cuenta_observacion: string | null;
  periodo_inicio: string;
  periodo_fin: string;
  dias_pagados: number | null;
  sueldo_dias: number | null;
  auxilio_transporte: number | null;
  total_devengado: number | null;
  neto_pagar: number | null;
  archivo_path: string | null;
  documento_id: string | null;
  anulado_en: string | null;
  motivo_anulacion: string | null;
}

export function TabDesprendible({ empleadoId, perfilId, desprendibles, hoy }: { empleadoId: string; perfilId: string | null; desprendibles: Desprendible[]; hoy: string }) {
  const { correr, pendiente, mensajes } = useAccion();
  const [f, setF] = useState({ pago: hoy, medio: "Transferencia", cuenta: "", inicio: "", fin: "", dias: "" });
  const [v, setV] = useState({ sueldo: "", auxilio: "", devengado: "", neto: "" });
  const [archivo, setArchivo] = useState<File | null>(null);
  const [publicar, setPublicar] = useState(!!perfilId);
  const falta = !f.pago ? "Falta la fecha de pago." : !f.inicio || !f.fin ? "Falta el periodo." : f.fin < f.inicio ? "El periodo termina antes de empezar." : null;
  return (
    <div className="space-y-3">
      <AvisoCaptura />
      <Bloque titulo="Nuevo desprendible">
        <div className="grid grid-cols-2 gap-2">
          <label className={L}>
            Fecha de pago
            <input type="date" value={f.pago} onChange={(e) => setF({ ...f, pago: e.target.value })} className={C} />
          </label>
          <label className={L}>
            Medio de pago
            <input value={f.medio} onChange={(e) => setF({ ...f, medio: e.target.value })} className={C} />
          </label>
        </div>
        <label className={`${L} mt-2`}>
          Cuenta / observación
          <input value={f.cuenta} onChange={(e) => setF({ ...f, cuenta: e.target.value })} placeholder="Banco, cuenta o nota" className={C} />
        </label>
        <div className="mt-2 grid grid-cols-3 gap-2">
          <label className={L}>
            Periodo desde
            <input type="date" value={f.inicio} onChange={(e) => setF({ ...f, inicio: e.target.value })} className={C} />
          </label>
          <label className={L}>
            Hasta
            <input type="date" value={f.fin} min={f.inicio || undefined} onChange={(e) => setF({ ...f, fin: e.target.value })} className={C} />
          </label>
          <label className={L}>
            Días pagados
            <input value={f.dias} onChange={(e) => setF({ ...f, dias: e.target.value })} inputMode="decimal" className={C} />
          </label>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Dinero etiqueta="Sueldo de días trabajados" valor={v.sueldo} onCambio={(x) => setV({ ...v, sueldo: x })} />
          <Dinero etiqueta="Auxilio de transporte" valor={v.auxilio} onCambio={(x) => setV({ ...v, auxilio: x })} />
          <Dinero etiqueta="Total devengado" valor={v.devengado} onCambio={(x) => setV({ ...v, devengado: x })} />
          <Dinero etiqueta="Neto a pagar" valor={v.neto} onCambio={(x) => setV({ ...v, neto: x })} />
        </div>
        <p className="mt-1 text-xs text-slate-500">Comprobante de pago del periodo. No incluye cesantías, prima, vacaciones ni indemnización.</p>
        <div className="mt-2 space-y-1">
          {archivo ? (
            <p className="text-xs">
              📎 {archivo.name}{" "}
              <button type="button" onClick={() => setArchivo(null)} className="underline">
                Quitar
              </button>
            </p>
          ) : (
            <ElegirArchivo onElegido={setArchivo} textoFoto="📷 Foto" textoArchivo="PDF del desprendible" />
          )}
          <Publicar perfilId={perfilId} publicar={publicar} setPublicar={setPublicar} />
        </div>
        <button
          type="button"
          disabled={pendiente || falta !== null}
          onClick={() =>
            correr(async () => {
              const subida = archivo
                ? await guardarArchivo(
                    archivo,
                    empleadoId,
                    "desprendibles",
                    publicar && perfilId ? { perfilId, tipo: "desprendible", titulo: `Desprendible ${fechaCorta(f.inicio)} – ${fechaCorta(f.fin)}`, inicio: f.inicio, fin: f.fin } : null,
                  )
                : null;
              await ok(
                createClient()
                  .from("desprendibles")
                  .insert({
                    empleado_id: empleadoId,
                    fecha_pago: f.pago,
                    medio_pago: f.medio.trim() || null,
                    cuenta_observacion: f.cuenta.trim() || null,
                    periodo_inicio: f.inicio,
                    periodo_fin: f.fin,
                    dias_pagados: f.dias.trim() ? Number(f.dias.replace(",", ".")) : null,
                    sueldo_dias: leerMonto(v.sueldo),
                    auxilio_transporte: leerMonto(v.auxilio),
                    total_devengado: leerMonto(v.devengado),
                    neto_pagar: leerMonto(v.neto),
                    archivo_path: subida?.path ?? null,
                    documento_id: subida?.documentoId ?? null,
                  }),
              );
              setArchivo(null);
              setV({ sueldo: "", auxilio: "", devengado: "", neto: "" });
              return subida?.documentoId ? "Desprendible registrado y publicado a la persona." : "Desprendible registrado.";
            })
          }
          className={`${BOTON} mt-2`}
        >
          Registrar desprendible
        </button>
        {falta && <p className="mt-1 text-xs text-slate-500">{falta}</p>}
      </Bloque>
      <Bloque titulo="Historial de desprendibles">
        <ul className="space-y-2">
          {desprendibles.length === 0 && <li className="text-xs text-slate-500">Sin desprendibles registrados.</li>}
          {desprendibles.map((d) => (
            <li key={d.id} className={`rounded-md border border-slate-200 p-2 text-sm ${d.anulado_en ? "opacity-60" : ""}`}>
              <div className="flex justify-between gap-2">
                <p className="font-semibold">
                  Periodo {fechaCorta(d.periodo_inicio)} al {fechaCorta(d.periodo_fin)}
                  {d.dias_pagados !== null ? ` · ${Number(d.dias_pagados)} días pagados` : ""}
                </p>
                <p className="shrink-0 font-bold">{d.neto_pagar !== null ? pesos(Number(d.neto_pagar)) : "—"}</p>
              </div>
              <p className="text-xs text-slate-600">
                Pagado el {fechaCorta(d.fecha_pago)}
                {d.medio_pago ? ` · ${d.medio_pago}` : ""}
                {d.cuenta_observacion ? ` · ${d.cuenta_observacion}` : ""}
              </p>
              {d.anulado_en && <p className="text-xs text-red-800">Anulado: {d.motivo_anulacion}</p>}
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <Archivo path={d.archivo_path} documentoId={d.documento_id} />
                {!d.anulado_en && <Anular tabla="desprendibles" id={d.id} />}
              </div>
              {d.anulado_en && d.documento_id && (
                <p className="text-xs text-slate-500">Si la persona todavía lo ve, anúlalo también en RRHH → Documentos del personal.</p>
              )}
            </li>
          ))}
        </ul>
      </Bloque>
      {mensajes}
    </div>
  );
}

// ============================================================ Caja menor
export interface ReciboCaja {
  id: string;
  concepto: string;
  proyecto_id: string | null;
  fecha_entrega: string;
  total: number;
  anulado_en: string | null;
  motivo_anulacion: string | null;
}
export interface LineaCaja {
  recibo_id: string;
  concepto: string;
  documento_soporte: string | null;
  valor: number;
}
export interface SoporteCaja {
  recibo_id: string;
  storage_path: string;
  nombre_archivo: string | null;
}

export function TabCajaMenor({
  empleadoId,
  recibos,
  lineas,
  soportes,
  proyectos,
  hoy,
}: {
  empleadoId: string;
  recibos: ReciboCaja[];
  lineas: LineaCaja[];
  soportes: SoporteCaja[];
  proyectos: { id: string; codigo: string; nombre: string }[];
  hoy: string;
}) {
  const { correr, pendiente, mensajes } = useAccion();
  const [concepto, setConcepto] = useState("");
  const [proyecto, setProyecto] = useState("");
  const [fecha, setFecha] = useState(hoy);
  const [filas, setFilas] = useState([{ concepto: "", soporte: "", valor: "" }]);
  const [archivos, setArchivos] = useState<File[]>([]);
  const total = filas.reduce((s, f) => s + (leerMonto(f.valor) ?? 0), 0);
  const validas = filas.filter((f) => f.concepto.trim() && leerMonto(f.valor) !== null);
  const falta = !concepto.trim() ? "Falta para qué se entrega el dinero." : validas.length === 0 ? "Agrega al menos una línea con concepto y valor." : null;
  const nombreProyecto = new Map(proyectos.map((p) => [p.id, `${p.nombre} (${p.codigo})`]));

  return (
    <div className="space-y-3">
      <p className="rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-900">
        Caja menor = viáticos para obra fuera de la ciudad (estadía, alimentación…). Las compras de material en la ciudad van por Gastos, no por acá.
      </p>
      <Bloque titulo="Nuevo recibo de caja menor">
        <label className={L}>
          Concepto
          <input value={concepto} onChange={(e) => setConcepto(e.target.value)} placeholder="Para qué se entrega el dinero" className={C} />
        </label>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <label className={L}>
            Obra (fuera de la ciudad)
            <select value={proyecto} onChange={(e) => setProyecto(e.target.value)} className={C}>
              <option value="">—</option>
              {proyectos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre} ({p.codigo})
                </option>
              ))}
            </select>
          </label>
          <label className={L}>
            Fecha de entrega
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={C} />
          </label>
        </div>
        <p className="mt-2 text-xs font-semibold text-slate-700">Detalle del gasto</p>
        <p className="text-xs text-slate-500">Cada línea lleva el documento que lo justifica (factura, cuenta de cobro o relación).</p>
        <div className="mt-1 space-y-1">
          {filas.map((f, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_6rem_auto] gap-1">
              <input value={f.concepto} onChange={(e) => setFilas(filas.map((x, j) => (j === i ? { ...x, concepto: e.target.value } : x)))} placeholder="Transporte, hotel, alimentación…" className={C} />
              <input value={f.soporte} onChange={(e) => setFilas(filas.map((x, j) => (j === i ? { ...x, soporte: e.target.value } : x)))} placeholder="Factura, cuenta o relación" className={C} />
              <input value={f.valor} onChange={(e) => setFilas(filas.map((x, j) => (j === i ? { ...x, valor: e.target.value } : x)))} placeholder="Valor" inputMode="numeric" className={C} />
              <button type="button" onClick={() => setFilas(filas.length > 1 ? filas.filter((_, j) => j !== i) : filas)} className="px-1 text-xs underline" aria-label="Quitar línea">
                ✕
              </button>
            </div>
          ))}
          <button type="button" onClick={() => setFilas([...filas, { concepto: "", soporte: "", valor: "" }])} className={BOTON2}>
            + Agregar línea
          </button>
        </div>
        <p className="mt-2 text-xs font-semibold text-slate-700">Soportes y justificación</p>
        <p className="text-xs text-slate-500">Facturas, relación de gastos, tiquetes, peajes u otros documentos que respaldan el pago.</p>
        <div className="mt-1">
          <ElegirArchivo onElegido={(a) => setArchivos([...archivos, a])} textoFoto="📷 Foto" textoArchivo="Archivo" />
          {archivos.map((a, i) => (
            <p key={i} className="text-xs">
              📎 {a.name}{" "}
              <button type="button" onClick={() => setArchivos(archivos.filter((_, j) => j !== i))} className="underline">
                Quitar
              </button>
            </p>
          ))}
        </div>
        <div className="mt-2 flex items-center justify-between rounded-md bg-slate-50 px-2 py-2">
          <span className="text-sm font-semibold">Total a entregar</span>
          <span className="text-base font-bold">{pesos(total)}</span>
        </div>
        <p className="text-xs text-slate-500">No constituye salario ni entra al desprendible de nómina.</p>
        <button
          type="button"
          disabled={pendiente || falta !== null}
          onClick={() =>
            correr(async () => {
              const r = await ok<{ id: string }>(
                createClient()
                  .from("caja_menor_recibos")
                  .insert({ empleado_id: empleadoId, concepto: concepto.trim(), proyecto_id: proyecto || null, fecha_entrega: fecha })
                  .select("id")
                  .single(),
              );
              await ok(
                createClient()
                  .from("caja_menor_lineas")
                  .insert(validas.map((f, i) => ({ recibo_id: r.id, concepto: f.concepto.trim(), documento_soporte: f.soporte.trim() || null, valor: leerMonto(f.valor), orden: i }))),
              );
              for (const a of archivos) {
                const s = await subirSoporte(`personal/${empleadoId}/caja-menor/${r.id}`, a, BUCKET_PERSONAL);
                await ok(createClient().from("caja_menor_soportes").insert({ recibo_id: r.id, storage_path: s.path, nombre_archivo: s.nombre, mime: s.mime, bytes: s.bytes }));
              }
              setConcepto("");
              setFilas([{ concepto: "", soporte: "", valor: "" }]);
              setArchivos([]);
              return "Recibo de caja menor registrado.";
            })
          }
          className={`${BOTON} mt-2`}
        >
          Registrar recibo
        </button>
        {falta && <p className="mt-1 text-xs text-slate-500">{falta}</p>}
      </Bloque>
      <Bloque titulo="Historial de recibos de caja menor">
        <ul className="space-y-2">
          {recibos.length === 0 && <li className="text-xs text-slate-500">Sin recibos.</li>}
          {recibos.map((r) => (
            <li key={r.id} className={`rounded-md border border-slate-200 p-2 text-sm ${r.anulado_en ? "opacity-60" : ""}`}>
              <div className="flex justify-between gap-2">
                <p className="font-semibold">{r.concepto}</p>
                <p className="shrink-0 font-bold">{pesos(Number(r.total))}</p>
              </div>
              <p className="text-xs text-slate-600">
                Entregado el {fechaCorta(r.fecha_entrega)}
                {r.proyecto_id ? ` · ${nombreProyecto.get(r.proyecto_id) ?? "obra"}` : ""}
              </p>
              <ul className="mt-1 text-xs text-slate-700">
                {lineas
                  .filter((l) => l.recibo_id === r.id)
                  .map((l, i) => (
                    <li key={i}>
                      {l.concepto}
                      {l.documento_soporte ? ` (${l.documento_soporte})` : ""}: {pesos(Number(l.valor))}
                    </li>
                  ))}
              </ul>
              <div className="flex flex-wrap gap-x-2">
                {soportes
                  .filter((s) => s.recibo_id === r.id)
                  .map((s) => (
                    <AbrirArchivo key={s.storage_path} bucket={BUCKET_PERSONAL} path={s.storage_path}>
                      📎 {s.nombre_archivo ?? "soporte"}
                    </AbrirArchivo>
                  ))}
              </div>
              {r.anulado_en ? <p className="text-xs text-red-800">Anulado: {r.motivo_anulacion}</p> : <Anular tabla="caja_menor_recibos" id={r.id} />}
            </li>
          ))}
        </ul>
      </Bloque>
      {mensajes}
    </div>
  );
}
