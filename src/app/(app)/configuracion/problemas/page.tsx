import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requierePermiso } from "@/lib/permisos";
import {
  COLUMNAS_OBSERVACION,
  COLUMNAS_REPORTE,
  nombreModulo,
  TIPO_REPORTE,
  TIPOS_REPORTE,

  type ReporteProblema,
  type TipoReporte,
} from "@/lib/reportes-problema";
import { ProblemasAdmin } from "./ProblemasAdmin";

const FILTROS: { id: string; nombre: string; estados: string[] }[] = [
  { id: "abiertos", nombre: "Por decidir", estados: ["nuevo", "en_revision"] },
  { id: "aceptados", nombre: "Aceptados (por hacer)", estados: ["aceptado"] },
  { id: "cerrados", nombre: "Cerrados", estados: ["resuelto", "descartado", "no_es_error"] },
  { id: "todos", nombre: "Todos", estados: ["nuevo", "en_revision", "aceptado", "resuelto", "descartado", "no_es_error"] },
];

// Problemas y observaciones de todos (migraciones 73 y 104), en una sola bandeja. Los atiende quien
// administra (Configuración "responsable"): agrupados por módulo y, dentro, por tipo (primero los
// hallazgos, que citan norma), para recorrerlos en orden y decidir qué sí y qué no.
export default async function ProblemasPage({ searchParams }: { searchParams: Promise<{ ver?: string; modulo?: string; tipo?: string }> }) {
  await requierePermiso("configuracion", "responsable");
  const { ver, modulo, tipo } = await searchParams;
  const filtro = FILTROS.find((f) => f.id === ver) ?? FILTROS[0];
  const supabase = await createClient();
  const consulta = (columnas: string) =>
    supabase.from("reportes_problema").select(columnas).in("estado", filtro.estados).order("reportado_en", { ascending: false }).limit(500);
  let reportesRes = await consulta(COLUMNAS_OBSERVACION);
  const sin104 = !!reportesRes.error;
  if (sin104) reportesRes = await consulta(COLUMNAS_REPORTE);
  const usuariosRes = await supabase.rpc("fn_listar_usuarios");
  const todos = ((reportesRes.data ?? []) as unknown as ReporteProblema[]).map((r) => ({
    ...r,
    tipo: (r.tipo ?? "problema") as TipoReporte,
    modulo: r.modulo ?? (r.ruta.split("/")[1] || null),
  }));
  const nombres = Object.fromEntries(
    ((usuariosRes.data ?? []) as { id: string; email: string; nombre?: string | null }[]).map((u) => [u.id, u.nombre || u.email]),
  );

  // Los contadores son los filtros (por módulo y por tipo), sobre el estado elegido.
  const porModulo = new Map<string, number>();
  for (const r of todos) porModulo.set(r.modulo ?? "", (porModulo.get(r.modulo ?? "") ?? 0) + 1);
  const delModulo = modulo !== undefined ? todos.filter((r) => (r.modulo ?? "") === modulo) : todos;
  const porTipo = new Map<string, number>();
  for (const r of delModulo) porTipo.set(r.tipo, (porTipo.get(r.tipo) ?? 0) + 1);
  const visibles = tipo ? delModulo.filter((r) => r.tipo === tipo) : delModulo;
  const enlace = (cambio: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    const v = { ver: filtro.id, modulo, tipo, ...cambio };
    for (const [k, x] of Object.entries(v)) if (x !== undefined) q.set(k, x);
    return `/configuracion/problemas?${q.toString()}`;
  };
  const chip = (activo: boolean) =>
    `inline-flex min-h-11 items-center rounded-full border px-3 text-sm font-medium ${activo ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 text-slate-700"}`;

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 p-4 sm:p-6 lg:max-w-6xl">
      <Link href="/configuracion" className="text-sm text-slate-600 underline">
        ← Configuración
      </Link>
      <h1 className="mt-2 text-lg font-bold text-slate-900">Problemas y observaciones</h1>
      <p className="mb-3 text-sm text-slate-600">
        Lo que registran desde “Registrar problema u observación” (barra de arriba): problemas, hallazgos con su norma, sugerencias y dudas. Quien lo registró ve el estado y tu respuesta.
      </p>
      {sin104 && <p className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">Falta correr la migración 104: por ahora solo se ven los problemas, sin tipo ni norma.</p>}
      <div className="mb-2 flex flex-wrap gap-2">
        {FILTROS.map((f) => (
          <Link key={f.id} href={`/configuracion/problemas?ver=${f.id}`} className={chip(f.id === filtro.id)}>
            {f.nombre}
          </Link>
        ))}
      </div>
      <div className="mb-2 flex flex-wrap gap-2">
        <Link href={enlace({ modulo: undefined, tipo: undefined })} className={chip(modulo === undefined)}>
          Todos los módulos · {todos.length}
        </Link>
        {[...porModulo.entries()].sort((a, b) => b[1] - a[1]).map(([m, n]) => (
          <Link key={m} href={enlace({ modulo: m, tipo: undefined })} className={chip(modulo === m)}>
            {nombreModulo(m || null)} · {n}
          </Link>
        ))}
      </div>
      <div className="mb-3 flex flex-wrap gap-2">
        <Link href={enlace({ tipo: undefined })} className={chip(!tipo)}>
          Todo tipo · {delModulo.length}
        </Link>
        {TIPOS_REPORTE.filter((t) => porTipo.get(t.id)).map((t) => (
          <Link key={t.id} href={enlace({ tipo: t.id })} className={chip(tipo === t.id)}>
            {TIPO_REPORTE[t.id]} · {porTipo.get(t.id)}
          </Link>
        ))}
      </div>
      {reportesRes.error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">No se pudieron leer: {reportesRes.error.message}</p>
      ) : visibles.length === 0 ? (
        <p className="text-sm text-slate-500">No hay nada en este filtro.</p>
      ) : (
        <ProblemasAdmin reportes={visibles} nombres={nombres} sin104={sin104} />
      )}
    </div>
  );
}

