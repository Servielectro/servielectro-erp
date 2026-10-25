import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { MarcoRrhh } from "@/components/rrhh/FiltrosRrhh";
import { COLUMNAS_CAJA, type CajaMenor } from "@/lib/caja-menor";
import { nombreCompleto } from "@/lib/personal";
import { fechaCorta, pesos } from "@/lib/rrhh-registros";

const FILTROS = [
  { id: "abiertas", nombre: "Abiertas" },
  { id: "cerradas", nombre: "Cerradas" },
  { id: "todas", nombre: "Todas" },
];

// Todas las cajas menores (migración 69), con el saldo en vivo. Se abren en la ficha de cada
// persona (pestaña Caja menor), donde se asigna, se ve cada gasto con su foto y se cierra.
export default async function CajasMenoresPage({ searchParams }: { searchParams: Promise<{ estado?: string }> }) {
  const { estado } = await searchParams;
  const filtro = FILTROS.find((f) => f.id === estado)?.id ?? "abiertas";
  const supabase = await createClient();
  const { data: veTodo } = await supabase.rpc("fn_rrhh_ve_todo");
  if (veTodo !== true) {
    return (
      <MarcoRrhh titulo="Caja menor">
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">Ver las cajas menores de todos requiere RRHH en nivel “trabajar”.</p>
      </MarcoRrhh>
    );
  }
  let q = supabase.from("v_caja_menor_recibos").select(COLUMNAS_CAJA).is("anulado_en", null).order("fecha_entrega", { ascending: false }).limit(200);
  if (filtro === "abiertas") q = q.eq("estado", "abierta");
  if (filtro === "cerradas") q = q.eq("estado", "cerrada");
  const [{ data, error }, empleados] = await Promise.all([
    q,
    supabase.from("empleados").select("id, primer_nombre, otros_nombres, primer_apellido, segundo_apellido, perfil_id"),
  ]);
  const cajas = (data ?? []) as CajaMenor[];
  const persona = new Map(
    ((empleados.data ?? []) as { id: string; primer_nombre: string; otros_nombres: string | null; primer_apellido: string; segundo_apellido: string | null; perfil_id: string | null }[]).map(
      (e) => [e.id, { nombre: nombreCompleto(e), enlazada: !!e.perfil_id }],
    ),
  );
  const asignado = cajas.reduce((s, c) => s + Number(c.monto_asignado), 0);
  const gastado = cajas.reduce((s, c) => s + Number(c.gastado), 0);

  return (
    <MarcoRrhh titulo="Caja menor" ayuda="Viáticos de obra fuera de la ciudad. Se asignan en la ficha de cada persona (pestaña Caja menor); el técnico registra cada gasto con su foto.">
      <div className="mb-3 grid grid-cols-3 gap-2">
        {FILTROS.map((f) => (
          <Link
            key={f.id}
            href={`/rrhh/caja-menor?estado=${f.id}`}
            className={`flex min-h-9 items-center justify-center rounded-md border px-2 text-xs font-semibold ${
              f.id === filtro ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700"
            }`}
          >
            {f.nombre}
          </Link>
        ))}
      </div>
      {error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {/monto_asignado|saldo/.test(error.message) ? "Falta correr la migración 69 en la base." : error.message}
        </p>
      ) : cajas.length === 0 ? (
        <p className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-3 text-sm text-blue-900">
          No hay cajas menores {filtro === "abiertas" ? "abiertas" : filtro === "cerradas" ? "cerradas" : ""}. Se asignan desde la ficha de la persona en
          Personal → pestaña Caja menor.
        </p>
      ) : (
        <>
          <p className="mb-2 text-xs text-slate-600">
            {cajas.length} {cajas.length === 1 ? "caja" : "cajas"} · asignado {pesos(asignado)} · gastado {pesos(gastado)}
          </p>
          <ul className="space-y-2 lg:grid lg:grid-cols-2 lg:items-start lg:gap-2 lg:space-y-0">
            {cajas.map((c) => {
              const p = persona.get(c.empleado_id);
              const negativo = Number(c.saldo) < 0;
              return (
                <li key={c.id}>
                  <Link href={`/rrhh/personal/${c.empleado_id}?tab=caja`} className={`block rounded-lg border bg-white p-3 text-sm ${negativo ? "border-red-400" : "border-slate-300"}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900">{p?.nombre ?? "—"}</p>
                        <p className="text-xs text-slate-600">
                          {c.concepto} · {fechaCorta(c.fecha_entrega)} · {c.estado === "abierta" ? "abierta" : "cerrada"}
                        </p>
                        {p && !p.enlazada && <p className="text-xs font-semibold text-amber-700">Ficha sin usuario del ERP: el técnico no la ve.</p>}
                      </div>
                      <div className="shrink-0 text-right">
                        <p className={`font-bold ${negativo ? "text-red-700" : "text-green-800"}`}>{pesos(Number(c.saldo))}</p>
                        <p className="text-xs text-slate-500">de {pesos(Number(c.monto_asignado))}</p>
                        {negativo && <p className="text-xs font-semibold text-red-700">excede {pesos(Number(c.excedente))}</p>}
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </MarcoRrhh>
  );
}
