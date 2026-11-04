import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ESTADO_PROYECTO } from "@/lib/supabase/proyectos";
import { COLUMNAS_PROYECTO_CLIENTE, fechaCorta, type ProyectoCliente } from "@/lib/cliente-portal";

// Sus proyectos, SOLO por v_cliente_mis_proyectos (sin costos, márgenes ni descripción interna).
export default async function MisProyectosPage() {
  const supabase = await createClient();
  const [proyectosRes, pendientesRes] = await Promise.all([
    supabase.from("v_cliente_mis_proyectos").select(COLUMNAS_PROYECTO_CLIENTE).order("fecha_inicio", { ascending: false, nullsFirst: false }),
    supabase.from("v_cliente_por_firmar").select("formato_id", { count: "exact", head: true }).eq("ya_firmado", false),
  ]);
  const proyectos = (proyectosRes.data ?? []) as ProyectoCliente[];
  const pendientes = pendientesRes.count ?? 0;

  return (
    <div className="space-y-3">
      <h1 className="text-xl font-bold text-slate-900">Mis proyectos</h1>
      {pendientes > 0 && (
        <Link href="/cliente/firmas" className="flex min-h-14 items-center justify-between rounded-xl border-2 border-amber-500 bg-amber-50 px-4 py-2 text-base font-bold text-amber-900">
          {pendientes === 1 ? "Tienes 1 documento por firmar" : `Tienes ${pendientes} documentos por firmar`}
          <span aria-hidden>→</span>
        </Link>
      )}
      {proyectosRes.error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">No se pudieron leer tus proyectos. Intenta de nuevo en un momento.</p>
      ) : proyectos.length === 0 ? (
        <p className="rounded-xl bg-white px-4 py-3 text-base text-slate-700">Todavía no hay proyectos registrados a tu nombre.</p>
      ) : (
        <ul className="space-y-3">
          {proyectos.map((p) => (
            <li key={p.id} className="rounded-xl border border-slate-300 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{p.codigo ?? "Proyecto"}</p>
              <p className="text-lg font-bold leading-snug text-slate-900">{p.nombre}</p>
              <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                <dt className="text-slate-500">Estado</dt>
                <dd className="font-semibold text-slate-900">{ESTADO_PROYECTO[p.estado as keyof typeof ESTADO_PROYECTO] ?? p.estado}</dd>
                <dt className="text-slate-500">Inicio</dt>
                <dd>{fechaCorta(p.fecha_inicio)}</dd>
                <dt className="text-slate-500">Fin estimado</dt>
                <dd>{fechaCorta(p.fecha_fin_estimada)}</dd>
                <dt className="text-slate-500">Contrato</dt>
                <dd>{p.contrato_firmado ? "Firmado" : "Sin firmar"}</dd>
              </dl>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Link
                  href={`/cliente/documentos?proyecto=${p.id}`}
                  className="flex min-h-12 items-center justify-center rounded-lg bg-slate-900 px-3 text-center text-sm font-semibold text-white"
                >
                  Documentos ({p.documentos})
                </Link>
                <Link
                  href={`/cliente/personal?proyecto=${p.id}`}
                  className="flex min-h-12 items-center justify-center rounded-lg border-2 border-slate-900 px-3 text-center text-sm font-semibold text-slate-900"
                >
                  Personal en obra
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
