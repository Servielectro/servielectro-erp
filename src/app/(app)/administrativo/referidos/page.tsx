import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { tienePermiso } from "@/lib/permisos";
import { formatCOP } from "@/lib/pricing";
import { ETIQUETA_CATEGORIA, type Plan } from "@/lib/referidos";
import { FormReferido } from "./FormReferido";

interface Resumen {
  id: string;
  nombre: string;
  categoria: string;
  estado: string;
  ciudad: string | null;
  registros_vigentes: number;
  registros_ganados: number;
  comision_pendiente: number;
  comision_pagada: number;
}

/**
 * Referenciados (migración 127): quién trae negocio y cuánto se le debe. El resumen sale de
 * v_referidos_resumen; "pendiente" es lo causado o aprobado que no se ha pagado.
 */
export default async function ReferidosPage(props: PageProps<"/administrativo/referidos">) {
  const sp = await props.searchParams;
  const verInactivos = sp.inactivos === "1";
  const supabase = await createClient();
  const [escribe, resRes, planesRes] = await Promise.all([
    tienePermiso("administrativo", "trabajar"),
    supabase.from("v_referidos_resumen").select("*").order("nombre"),
    supabase.from("referido_planes").select("*").eq("activo", true).order("nombre"),
  ]);
  const todos = (resRes.data ?? []) as Resumen[];
  const filas = todos.filter((r) => verInactivos || r.estado === "activo");
  const suma = (k: keyof Resumen) => todos.reduce((t, r) => t + Number(r[k] ?? 0), 0);

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 space-y-3 p-4 sm:p-6 lg:max-w-6xl">
      <Link href="/administrativo" className="text-sm text-slate-600 underline">
        ← Administrativo
      </Link>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="flex-1 text-lg font-bold text-slate-900">Referenciados</h1>
        <Link href="/administrativo/referidos/registros" className="flex min-h-11 items-center rounded-lg border border-slate-300 bg-white px-3 text-sm">
          Registros de oportunidad
        </Link>
        <Link href="/administrativo/comisiones" className="flex min-h-11 items-center rounded-lg border border-slate-300 bg-white px-3 text-sm">
          Comisiones
        </Link>
        <Link href="/administrativo/referidos/planes" className="flex min-h-11 items-center rounded-lg border border-slate-300 bg-white px-3 text-sm">
          Planes
        </Link>
      </div>
      <p className="text-xs text-slate-600">
        Personas o empresas que traen clientes a cambio de una comisión. La comisión se causa cuando el cliente paga, no cuando firma, y cada prospecto queda protegido solo mientras su registro esté vigente.
      </p>

      {resRes.error ? (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">No se pudo leer el resumen: {resRes.error.message}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <Cifra titulo="Registros vigentes" valor={String(suma("registros_vigentes"))} />
            <Cifra titulo="Registros ganados" valor={String(suma("registros_ganados"))} />
            <Cifra titulo="Comisión pendiente" valor={formatCOP(suma("comision_pendiente"))} nota="causada o aprobada, sin pagar" />
            <Cifra titulo="Comisión pagada" valor={formatCOP(suma("comision_pagada"))} />
          </div>

          {escribe && <FormReferido planes={(planesRes.data ?? []) as Plan[]} />}

          {filas.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">Todavía no hay referidos registrados.</p>
          ) : (
            <ul className="space-y-2 lg:grid lg:grid-cols-2 lg:gap-2 lg:space-y-0">
              {filas.map((r) => (
                <li key={r.id}>
                  <Link href={`/administrativo/referidos/${r.id}`} className={`block rounded-lg border border-slate-300 bg-white p-3 active:bg-slate-50 ${r.estado === "activo" ? "" : "opacity-60"}`}>
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-900">{r.nombre}</p>
                        <p className="text-xs text-slate-600">
                          {[ETIQUETA_CATEGORIA[r.categoria] ?? r.categoria, r.ciudad, r.estado !== "activo" && r.estado].filter(Boolean).join(" · ")}
                        </p>
                      </div>
                    </div>
                    <p className="mt-1 text-xs text-slate-700">
                      {r.registros_vigentes} vigente{r.registros_vigentes === 1 ? "" : "s"} · {r.registros_ganados} ganado{r.registros_ganados === 1 ? "" : "s"}
                    </p>
                    <p className="text-xs text-slate-700">
                      Pendiente <span className={Number(r.comision_pendiente) > 0 ? "font-semibold text-amber-800" : ""}>{formatCOP(Number(r.comision_pendiente))}</span> · Pagado {formatCOP(Number(r.comision_pagada))}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {todos.some((r) => r.estado !== "activo") && (
            <Link href={verInactivos ? "/administrativo/referidos" : "/administrativo/referidos?inactivos=1"} className="block text-center text-sm text-slate-600 underline">
              {verInactivos ? "Ocultar inactivos y suspendidos" : "Ver también inactivos y suspendidos"}
            </Link>
          )}
        </>
      )}
    </div>
  );
}

function Cifra({ titulo, valor, nota }: { titulo: string; valor: string; nota?: string }) {
  return (
    <div className="rounded-lg border border-slate-300 bg-white p-3">
      <p className="text-xs text-slate-600">{titulo}</p>
      <p className="text-base font-bold text-slate-900">{valor}</p>
      {nota && <p className="text-[11px] text-slate-500">{nota}</p>}
    </div>
  );
}
