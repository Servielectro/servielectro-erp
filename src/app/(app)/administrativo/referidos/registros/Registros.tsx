"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { fechaCorta, hoyBogota } from "@/lib/marketing";
import { ESTADO_REGISTRO, soloDigitos, sumarDias, textoDias } from "@/lib/referidos";

export interface RegistroVista {
  id: string;
  referido_id: string;
  referido_nombre: string;
  cliente_id: string | null;
  nit_prospecto: string | null;
  nombre_prospecto: string;
  contacto: string | null;
  telefono: string | null;
  ciudad: string | null;
  nota: string | null;
  registrado_en: string;
  vence_el: string;
  estado: string;
  estado_real: string;
  dias_restantes: number;
  motivo: string | null;
}
export interface ClienteCorto {
  id: string;
  nombre: string;
  nit: string | null;
}

const input = "mt-1 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base font-normal";
const etiqueta = "block text-sm font-semibold text-slate-800";

export function ListaRegistros({ registros, escribe, conReferido }: { registros: RegistroVista[]; escribe: boolean; conReferido?: boolean }) {
  if (!registros.length) return <p className="py-4 text-center text-sm text-slate-500">No hay registros.</p>;
  return (
    <ul className="space-y-2">
      {registros.map((g) => (
        <FilaRegistro key={g.id} g={g} escribe={escribe} conReferido={conReferido} />
      ))}
    </ul>
  );
}

function FilaRegistro({ g, escribe, conReferido }: { g: RegistroVista; escribe: boolean; conReferido?: boolean }) {
  const router = useRouter();
  const [cerrando, setCerrando] = useState<"ganado" | "perdido" | null>(null);
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  const e = ESTADO_REGISTRO[g.estado_real] ?? ESTADO_REGISTRO.vigente;
  // Sigue "vigente" en la tabla aunque la fecha haya pasado: mientras no se marque vencido,
  // el índice único le impide a otro referido registrar el mismo prospecto.
  const vencidoSinMarcar = g.estado === "vigente" && g.estado_real === "vencido";
  const dias = textoDias(g.dias_restantes);

  const cambiar = (estado: string, conMotivo?: string) =>
    empezar(async () => {
      setError(null);
      const { data, error: err } = await createClient()
        .from("referido_registros")
        .update({ estado, motivo: conMotivo?.trim() || null })
        .eq("id", g.id)
        .select("id");
      if (err) return setError(err.message);
      if (!data?.length) return setError("No se guardó (sin permiso).");
      setCerrando(null);
      router.refresh();
    });

  return (
    <li className="rounded-lg border border-slate-300 bg-white p-3">
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900">
            {g.cliente_id ? (
              <Link href={`/administrativo/clientes/${g.cliente_id}`} className="hover:underline">
                {g.nombre_prospecto}
              </Link>
            ) : (
              g.nombre_prospecto
            )}
          </p>
          <p className="text-xs text-slate-600">
            {[
              conReferido && (
                <Link key="r" href={`/administrativo/referidos/${g.referido_id}`} className="underline">
                  {g.referido_nombre}
                </Link>
              ),
              g.nit_prospecto && `NIT ${g.nit_prospecto}`,
              g.ciudad,
              [g.contacto, g.telefono].filter(Boolean).join(" "),
            ]
              .filter(Boolean)
              .map((x, i) => (
                <span key={i}>
                  {i > 0 && " · "}
                  {x}
                </span>
              ))}
          </p>
          <p className="text-xs text-slate-600">
            Registrado {fechaCorta(g.registrado_en)} · vence {fechaCorta(g.vence_el)}
            {g.estado === "vigente" && <span className={`font-semibold ${dias.clase}`}> · {dias.texto}</span>}
          </p>
          {g.nota && <p className="mt-1 text-xs text-slate-700">{g.nota}</p>}
          {g.motivo && <p className="mt-1 text-xs text-slate-700">Motivo: {g.motivo}</p>}
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${e.clase}`}>{e.label}</span>
      </div>
      {vencidoSinMarcar && (
        <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
          La ventana ya pasó, pero mientras no se marque como vencido este prospecto sigue bloqueado para otro referido.
        </p>
      )}
      {escribe && g.estado === "vigente" && !cerrando && (
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" disabled={pendiente} onClick={() => setCerrando("ganado")} className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm">
            Se ganó
          </button>
          <button type="button" disabled={pendiente} onClick={() => setCerrando("perdido")} className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm">
            Se perdió
          </button>
          {vencidoSinMarcar && (
            <button type="button" disabled={pendiente} onClick={() => cambiar("vencido")} className="min-h-11 rounded-lg border border-amber-400 bg-amber-50 px-3 text-sm font-semibold text-amber-900">
              Marcar vencido
            </button>
          )}
        </div>
      )}
      {cerrando && (
        <div className="mt-2 space-y-2 rounded-lg bg-slate-50 p-2">
          <label className={etiqueta}>
            {cerrando === "perdido" ? "¿Por qué se perdió? (obligatorio)" : "Nota (opcional): qué se firmó"}
            <input autoFocus value={motivo} onChange={(ev) => setMotivo(ev.target.value)} className={input} />
          </label>
          {cerrando === "ganado" && <p className="text-xs text-slate-600">La comisión no se causa aquí: se registra en Comisiones cuando el cliente pague.</p>}
          <div className="flex gap-2">
            <button type="button" onClick={() => setCerrando(null)} className="min-h-11 flex-1 rounded-lg border border-slate-300 text-sm">
              Cancelar
            </button>
            <button type="button" disabled={pendiente || (cerrando === "perdido" && !motivo.trim())} onClick={() => cambiar(cerrando, motivo)} className="min-h-11 flex-1 rounded-lg bg-slate-900 text-sm font-semibold text-white disabled:opacity-40">
              Guardar
            </button>
          </div>
        </div>
      )}
      {error && <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
    </li>
  );
}

/** Registrar un prospecto a nombre de un referido. La ventana la pone el plan (90 días si no tiene). */
export function NuevoRegistro({ referidoId, diasVigencia, clientes }: { referidoId: string; diasVigencia: number; clientes: ClienteCorto[] }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [f, setF] = useState({ cliente: "", nit: "", nombre: "", contacto: "", telefono: "", ciudad: "", nota: "" });
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  const hoy = hoyBogota();
  const vence = sumarDias(hoy, diasVigencia);
  const cliente = clientes.find((c) => c.nombre === f.cliente);

  if (!abierto)
    return (
      <button type="button" onClick={() => setAbierto(true)} className="min-h-11 rounded-lg bg-brand-red px-4 text-sm font-semibold text-white">
        + Registrar prospecto
      </button>
    );

  const guardar = () =>
    empezar(async () => {
      setError(null);
      const nit = soloDigitos(cliente?.nit ?? f.nit) || null;
      const supabase = createClient();
      // Antes de insertar, decir QUIÉN lo tiene: el índice único solo diría "duplicado".
      const filtros = [cliente && `cliente_id.eq.${cliente.id}`, nit && `nit_prospecto.eq.${nit}`].filter(Boolean).join(",");
      if (filtros) {
        const { data: ya } = await supabase.from("v_referido_registros").select("referido_nombre, vence_el, estado_real").eq("estado", "vigente").or(filtros).limit(1);
        const otro = ya?.[0] as { referido_nombre: string; vence_el: string; estado_real: string } | undefined;
        if (otro)
          return setError(
            otro.estado_real === "vencido"
              ? `Lo tenía registrado ${otro.referido_nombre} y la ventana venció el ${fechaCorta(otro.vence_el)}. Hay que marcarlo como vencido en Registros de oportunidad y volver a intentar.`
              : `Ese prospecto ya lo tiene registrado ${otro.referido_nombre} hasta el ${fechaCorta(otro.vence_el)}.`,
          );
      }
      const { data, error: e } = await supabase
        .from("referido_registros")
        .insert({
          referido_id: referidoId,
          cliente_id: cliente?.id ?? null,
          nit_prospecto: nit,
          nombre_prospecto: (cliente?.nombre ?? f.nombre).trim(),
          contacto: f.contacto.trim() || null,
          telefono: f.telefono.trim() || null,
          ciudad: f.ciudad.trim() || null,
          nota: f.nota.trim() || null,
          registrado_en: hoy,
          vence_el: vence,
        })
        .select("id");
      if (e) return setError(e.code === "23505" ? "Ese prospecto ya está registrado por otro referido." : e.message);
      if (!data?.length) return setError("No se guardó (sin permiso).");
      setAbierto(false);
      setF({ cliente: "", nit: "", nombre: "", contacto: "", telefono: "", ciudad: "", nota: "" });
      router.refresh();
    });

  return (
    <section className="space-y-3 rounded-lg border border-slate-400 bg-white p-3">
      <label className={etiqueta}>
        ¿Ya es cliente del ERP? (opcional)
        <input list="clientes-registro" value={f.cliente} onChange={(e) => setF({ ...f, cliente: e.target.value })} placeholder="Escribir y elegir de la lista" className={input} />
        <datalist id="clientes-registro">
          {clientes.map((c) => (
            <option key={c.id} value={c.nombre} />
          ))}
        </datalist>
      </label>
      {!cliente && (
        <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
          <label className={etiqueta}>
            Nombre del prospecto
            <input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} className={input} />
          </label>
          <label className={etiqueta}>
            NIT (si se sabe)
            <input inputMode="numeric" value={f.nit} onChange={(e) => setF({ ...f, nit: e.target.value })} className={input} />
          </label>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        <label className={etiqueta}>
          Contacto
          <input value={f.contacto} onChange={(e) => setF({ ...f, contacto: e.target.value })} className={input} />
        </label>
        <label className={etiqueta}>
          Teléfono
          <input type="tel" value={f.telefono} onChange={(e) => setF({ ...f, telefono: e.target.value })} className={input} />
        </label>
        <label className={etiqueta}>
          Ciudad
          <input value={f.ciudad} onChange={(e) => setF({ ...f, ciudad: e.target.value })} className={input} />
        </label>
      </div>
      <label className={etiqueta}>
        Qué necesita
        <textarea rows={2} value={f.nota} onChange={(e) => setF({ ...f, nota: e.target.value })} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-base font-normal" />
      </label>
      <p className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-700">
        Queda protegido a nombre de este referido {diasVigencia} días: hasta el <span className="font-semibold">{fechaCorta(vence)}</span>. Sin NIT ni cliente del ERP, nada impide que otro referido registre a la misma empresa con otro nombre.
      </p>
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={() => setAbierto(false)} className="min-h-11 flex-1 rounded-lg border border-slate-300 text-sm">
          Cancelar
        </button>
        <button type="button" disabled={pendiente || !(cliente || f.nombre.trim())} onClick={guardar} className="min-h-11 flex-1 rounded-lg bg-slate-900 text-sm font-semibold text-white disabled:opacity-40">
          {pendiente ? "Guardando…" : "Registrar"}
        </button>
      </div>
    </section>
  );
}
