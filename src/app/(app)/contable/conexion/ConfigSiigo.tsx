"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { CUENTA_PUC } from "@/lib/siigo";

export interface Config {
  usuario_api: string | null;
  partner_id: string | null;
  plan: string | null;
  cuentas_iva_generado: string[];
  cuentas_iva_descontable: string[];
  periodicidad_iva: "bimestral" | "cuatrimestral";
  cuentas_confirmadas_en: string | null;
  notas: string | null;
}

const input = "mt-1 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base font-normal";
const etiqueta = "block text-sm font-semibold text-slate-800";
const PLANES = ["Profesional independiente", "Emprendedor", "Premium"];
const aLista = (t: string) => t.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean);
/** ¿Dos cuentas (con o sin comodín %) toman alguna subcuenta en común? */
function seTocan(a: string, b: string) {
  const [pa, pb] = [a.replace("%", ""), b.replace("%", "")];
  if (a.endsWith("%") && b.endsWith("%")) return pa.startsWith(pb) || pb.startsWith(pa);
  if (a.endsWith("%")) return pb.startsWith(pa);
  if (b.endsWith("%")) return pa.startsWith(pb);
  return pa === pb;
}

/**
 * siigo_config es la ÚNICA tabla del espejo que se edita desde el ERP, y solo quien es
 * responsable de Contable (RLS de la 128). Aquí no hay campo de clave: va en Vault.
 */
export function ConfigSiigo({ c }: { c: Config }) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [f, setF] = useState({
    usuario_api: c.usuario_api ?? "",
    partner_id: c.partner_id ?? "",
    plan: c.plan ?? "",
    generado: c.cuentas_iva_generado.join(", "),
    descontable: c.cuentas_iva_descontable.join(", "),
    periodicidad_iva: c.periodicidad_iva,
    confirmadas: !!c.cuentas_confirmadas_en,
    notas: c.notas ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();

  const generado = aLista(f.generado);
  const descontable = aLista(f.descontable);
  const malas = [...generado, ...descontable].filter((x) => !CUENTA_PUC.test(x));
  const cuentasCambiaron = generado.join(",") !== c.cuentas_iva_generado.join(",") || descontable.join(",") !== c.cuentas_iva_descontable.join(",");
  // Una misma subcuenta en los dos lados contaría el IVA dos veces.
  const repetidas = generado.filter((g) => descontable.some((d) => seTocan(g, d)));

  if (!editando)
    return (
      <button type="button" onClick={() => setEditando(true)} className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm">
        Editar configuración
      </button>
    );

  const guardar = () =>
    empezar(async () => {
      setError(null);
      if (malas.length) return setError(`Estas no son cuentas del PUC: ${malas.join(", ")}. Van solo números, con % al final si es comodín (ej. 240805 o 2408%).`);
      if (repetidas.length) return setError(`${repetidas.join(", ")} toma cuentas que también están en el descontable: el IVA se contaría dos veces.`);
      const supabase = createClient();
      const { data: u } = await supabase.auth.getUser();
      // Si cambian las cuentas sin que se marque la confirmación, la confirmación anterior ya no vale.
      const confirmar = f.confirmadas && generado.length > 0 && descontable.length > 0;
      const confirmacion = confirmar
        ? cuentasCambiaron || !c.cuentas_confirmadas_en
          ? { cuentas_confirmadas_por: u.user?.id ?? null, cuentas_confirmadas_en: new Date().toISOString() }
          : {}
        : { cuentas_confirmadas_por: null, cuentas_confirmadas_en: null };
      const { data, error: e } = await supabase
        .from("siigo_config")
        .update({
          usuario_api: f.usuario_api.trim() || null,
          partner_id: f.partner_id.trim() || null,
          plan: f.plan || null,
          cuentas_iva_generado: generado,
          cuentas_iva_descontable: descontable,
          periodicidad_iva: f.periodicidad_iva,
          notas: f.notas.trim() || null,
          ...confirmacion,
        })
        .eq("id", 1)
        .select("id");
      if (e) return setError(e.message);
      if (!data?.length) return setError("No se guardó: solo quien es responsable de Contable puede cambiar la configuración.");
      setEditando(false);
      router.refresh();
    });

  return (
    <section className="space-y-3 rounded-lg border border-slate-400 bg-white p-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className={etiqueta}>
          Plan de Siigo
          <select value={f.plan} onChange={(e) => setF({ ...f, plan: e.target.value })} className={`${input} px-2`}>
            <option value="">Sin confirmar</option>
            {PLANES.map((p) => (
              <option key={p}>{p}</option>
            ))}
            {f.plan && !PLANES.includes(f.plan) && <option>{f.plan}</option>}
          </select>
        </label>
        <label className={etiqueta}>
          Usuario de la API
          <input value={f.usuario_api} onChange={(e) => setF({ ...f, usuario_api: e.target.value })} placeholder="correo del usuario Administrador" className={input} />
        </label>
        <label className={etiqueta}>
          Partner-Id
          <input value={f.partner_id} onChange={(e) => setF({ ...f, partner_id: e.target.value })} className={input} />
        </label>
      </div>
      <p className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-700">
        🔑 La clave de acceso de Siigo <span className="font-semibold">no se escribe aquí</span>: se guarda en Vault, igual que la del cron. Esta tabla la puede leer cualquiera con Contable o Financiero.
      </p>

      <div id="cuentas-iva" className="space-y-3 rounded-lg border border-slate-200 p-3">
        <p className="text-sm font-bold text-slate-900">Cuentas de IVA</p>
        <p className="text-xs text-slate-600">
          Copiarlas del plan de cuentas real de Servielectro en Siigo, con la contadora. El PUC no define cuál subcuenta de la 2408 es cada cosa. Varias se separan con coma; % al final toma todas las que empiezan así.
        </p>
        <label className={etiqueta}>
          IVA generado (ventas)
          <input value={f.generado} onChange={(e) => setF({ ...f, generado: e.target.value })} placeholder="ej. 240805" className={input} />
        </label>
        <label className={etiqueta}>
          IVA descontable (compras)
          <input value={f.descontable} onChange={(e) => setF({ ...f, descontable: e.target.value })} placeholder="ej. 240810" className={input} />
        </label>
        {repetidas.length > 0 && (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">{repetidas.join(", ")} toma cuentas que también están en el descontable: el IVA se contaría dos veces.</p>
        )}
        <label className={etiqueta}>
          El IVA se declara
          <select value={f.periodicidad_iva} onChange={(e) => setF({ ...f, periodicidad_iva: e.target.value as Config["periodicidad_iva"] })} className={`${input} px-2`}>
            <option value="cuatrimestral">Cuatrimestral</option>
            <option value="bimestral">Bimestral</option>
          </select>
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" checked={f.confirmadas} onChange={(e) => setF({ ...f, confirmadas: e.target.checked })} className="h-5 w-5" />
          La contadora confirmó estas cuentas y la periodicidad
        </label>
        {cuentasCambiaron && c.cuentas_confirmadas_en && !f.confirmadas && <p className="text-xs text-amber-800">Al cambiar las cuentas, la confirmación anterior se borra.</p>}
      </div>

      <label className={etiqueta}>
        Notas
        <textarea rows={3} value={f.notas} onChange={(e) => setF({ ...f, notas: e.target.value })} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-base font-normal" />
      </label>
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={() => setEditando(false)} className="min-h-11 flex-1 rounded-lg border border-slate-300 text-sm">
          Cancelar
        </button>
        <button type="button" disabled={pendiente} onClick={guardar} className="min-h-11 flex-1 rounded-lg bg-slate-900 text-sm font-semibold text-white disabled:opacity-40">
          {pendiente ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </section>
  );
}
