import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { COLUMNAS_POR_FIRMAR_CLIENTE, fechaCorta, type PorFirmarCliente } from "@/lib/cliente-portal";

// Actas de sus obras donde firma el contratante (v_cliente_por_firmar: borradores cuya plantilla
// pide la firma sst_cliente). Nada más: los formatos internos no aparecen aquí.
export default async function FirmasClientePage() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("v_cliente_por_firmar").select(COLUMNAS_POR_FIRMAR_CLIENTE).order("fecha");
  const filas = (data ?? []) as PorFirmarCliente[];
  const pendientes = filas.filter((f) => !f.ya_firmado);
  const firmadas = filas.filter((f) => f.ya_firmado);

  return (
    <div className="space-y-3">
      <h1 className="text-xl font-bold text-slate-900">Documentos por firmar</h1>
      {error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">No se pudo leer la lista. Intenta de nuevo en un momento.</p>
      ) : (
        <>
          {pendientes.length > 0 ? (
            <p className="rounded-lg border-2 border-amber-500 bg-amber-50 px-3 py-2 text-base font-bold text-amber-900">
              {pendientes.length === 1 ? "Tienes 1 acta pendiente de tu firma" : `Tienes ${pendientes.length} actas pendientes de tu firma`}
            </p>
          ) : (
            <p className="rounded-xl bg-white px-4 py-3 text-base text-slate-700">No tienes nada pendiente de firmar.</p>
          )}
          <ul className="space-y-2">
            {pendientes.map((f) => (
              <Fila key={f.formato_id} f={f} />
            ))}
          </ul>
          {firmadas.length > 0 && (
            <section className="space-y-2">
              <h2 className="pt-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Ya firmaste (falta que Servielectro las cierre)</h2>
              <ul className="space-y-2">
                {firmadas.map((f) => (
                  <Fila key={f.formato_id} f={f} />
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function Fila({ f }: { f: PorFirmarCliente }) {
  return (
    <li>
      <Link
        href={`/cliente/firmas/${f.formato_id}`}
        className={`flex min-h-14 items-center justify-between gap-2 rounded-xl border bg-white px-3 py-2 active:bg-slate-50 ${f.ya_firmado ? "border-slate-300" : "border-amber-500"}`}
      >
        <span className="min-w-0">
          <span className="block font-semibold text-slate-900">{f.formato}</span>
          <span className="block text-sm text-slate-600">
            {f.codigo} · {fechaCorta(f.fecha)}
            {f.proyecto_codigo ? ` · ${f.proyecto_codigo}` : ""}
          </span>
          <span className={`block text-sm font-semibold ${f.ya_firmado ? "text-green-700" : "text-amber-800"}`}>
            {f.ya_firmado ? "✓ Firmada por el contratante" : "Pendiente: leer y firmar"}
          </span>
        </span>
        <span className="text-lg" aria-hidden>
          →
        </span>
      </Link>
    </li>
  );
}
