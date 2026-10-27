import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { tienePermiso } from "@/lib/permisos";
import { getClientesActivos, type ClienteResumen } from "@/lib/supabase/clientes";
import { COLUMNAS_PROYECTO, ESTADO_PROYECTO, type Proyecto } from "@/lib/supabase/proyectos";
import { FormProyecto } from "../FormProyecto";
import { ESTADO_FORMATO } from "@/lib/sst/plantillas";

const ESTADO_VISITA: Record<string, string> = {
  programada: "Programada",
  en_curso: "En curso",
  firmada: "Firmada",
  cerrada: "Cerrada",
  cancelada: "Cancelada",
};

export default async function ProyectoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ creado?: string }>;
}) {
  const { id } = await params;
  const { creado } = await searchParams;
  const supabase = await createClient();
  const [comercialTrabaja, proyectosTrabaja, veClientes] = await Promise.all([
    tienePermiso("comercial", "trabajar"),
    tienePermiso("proyectos", "trabajar"),
    tienePermiso("comercial", "consultar"),
  ]);
  const puedeEditar = comercialTrabaja || proyectosTrabaja;

  const { data } = await supabase
    .from("proyectos")
    .select(`${COLUMNAS_PROYECTO}, clientes(nombre)`)
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();
  const p = data as unknown as Proyecto & { clientes: { nombre: string } | null };

  const [clientes, visitasRes, actasRes, plantillasActasRes] = await Promise.all([
    puedeEditar && veClientes ? getClientesActivos(supabase).catch(() => [] as ClienteResumen[]) : Promise.resolve([]),
    // Las visitas solo se ven con permiso de Operativo (RLS): si no, la lista queda vacía.
    supabase
      .from("visitas")
      .select("id, titulo, estado, fecha_programada")
      .eq("proyecto_id", id)
      .order("fecha_programada", { ascending: false })
      .limit(50),
    // Migración 85: las actas de esta obra (acta de inicio, de reunión…).
    supabase.from("sst_formatos").select("id, plantilla_id, fecha, estado").eq("ambito", "proyectos").eq("proyecto_id", id).order("fecha", { ascending: false }).limit(50),
    supabase.from("sst_plantillas").select("id, nombre").eq("ambito", "proyectos"),
  ]);
  const actas = (actasRes.data ?? []) as { id: string; plantilla_id: string; fecha: string; estado: string }[];
  const nombrePlantilla = new Map(((plantillasActasRes.data ?? []) as { id: string; nombre: string }[]).map((x) => [x.id, x.nombre]));
  const visitas = visitasRes.error ? [] : (visitasRes.data ?? []);
  const anio = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric" }).format(new Date());

  return (
    <div className="mx-auto w-full max-w-xl flex-1 p-4 sm:p-6">
      <Link href="/proyectos" className="mb-2 inline-block text-xs font-semibold text-slate-600">
        ← Proyectos
      </Link>
      <h1 className="text-center text-sm font-bold text-slate-900">{p.nombre}</h1>
      <p className="mb-4 text-center text-xs text-slate-600">
        {p.codigo} · {ESTADO_PROYECTO[p.estado] ?? p.estado}
        {p.cotizacion_aprobada_id ? " · con cotización" : " · sin cotización"}
      </p>
      {creado && (
        <p className="mb-3 rounded-md bg-green-50 px-3 py-2 text-xs text-green-800">
          Proyecto creado con el código {p.codigo}. Ya lo pueden elegir Operativo y RRHH; al técnico le aparece cuando
          tenga una visita o una tarea de este proyecto.
        </p>
      )}

      {puedeEditar ? (
        <FormProyecto
          id={p.id}
          inicial={{
            nombre: p.nombre,
            codigo: p.codigo,
            clienteId: p.cliente_id,
            clienteNombre: p.clientes?.nombre ?? (p.cliente_id ? "(cliente sin permiso de lectura)" : ""),
            estado: p.estado,
            fechaInicio: p.fecha_inicio ?? "",
            fechaFinEstimada: p.fecha_fin_estimada ?? "",
            descripcion: p.descripcion ?? "",
          }}
          clientes={clientes}
          veClientes={veClientes}
          tieneCotizacion={!!p.cotizacion_aprobada_id}
          editaClienteConCotizacion={comercialTrabaja}
          anioActual={anio}
        />
      ) : (
        <div className="space-y-1 rounded-lg border border-slate-300 bg-white p-4 text-sm text-slate-700">
          <p>Cliente: {p.clientes?.nombre ?? "—"}</p>
          <p>Inicio: {p.fecha_inicio ?? "—"} · Fin estimado: {p.fecha_fin_estimada ?? "—"}</p>
          {p.descripcion && <p className="whitespace-pre-wrap">{p.descripcion}</p>}
          <p className="pt-2 text-xs text-slate-500">Editar proyectos requiere el módulo Proyectos en nivel “trabajar”.</p>
        </div>
      )}

      <div className="mb-2 mt-6 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-900">Actas de la obra</h2>
        {proyectosTrabaja && (
          <Link href={`/actas/campo?proyecto=${p.id}`} className="inline-flex min-h-11 items-center rounded-md bg-slate-900 px-3 text-xs font-semibold text-white">
            + Llenar un acta
          </Link>
        )}
      </div>
      {actas.length === 0 ? (
        <p className="text-xs text-slate-500">
          Ninguna todavía.{" "}
          {nombrePlantilla.size === 0 ? (
            <>
              Primero se arma la plantilla en{" "}
              <Link href="/proyectos/actas/plantillas" className="underline">
                Plantillas de actas
              </Link>
              .
            </>
          ) : (
            "Se llenan en la obra con sus firmas; quedan selladas y salen en PDF."
          )}
        </p>
      ) : (
        <ul className="divide-y divide-slate-200 rounded-lg border border-slate-300 bg-white">
          {actas.map((a) => (
            <li key={a.id}>
              <Link href={`/proyectos/actas/${a.id}`} className="block p-3 text-sm active:bg-slate-50">
                <p className="font-semibold text-slate-900">{nombrePlantilla.get(a.plantilla_id) ?? "Acta"}</p>
                <p className="text-xs text-slate-600">
                  {a.fecha} · {ESTADO_FORMATO[a.estado] ?? a.estado}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {!proyectosTrabaja && <p className="mt-1 text-xs text-slate-500">Llenar actas requiere Proyectos en nivel “trabajar”.</p>}

      <Link href={`/proyectos/reuniones?proyecto=${p.id}`} className="mt-3 flex min-h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800">
        🎙 Reuniones de la obra (grabar, acta, compromisos)
      </Link>

      <h2 className="mb-2 mt-6 text-sm font-semibold text-slate-900">Visitas y obras del proyecto</h2>
      {visitas.length === 0 ? (
        <p className="text-xs text-slate-500">
          Ninguna todavía. Se enlazan al crear la visita en Operativo, eligiendo este proyecto.
        </p>
      ) : (
        <ul className="divide-y divide-slate-200 rounded-lg border border-slate-300 bg-white">
          {visitas.map((v) => (
            <li key={v.id}>
              <Link href={`/operativo/visitas/${v.id}`} className="block p-3 text-sm active:bg-slate-50">
                <p className="font-semibold text-slate-900">{v.titulo}</p>
                <p className="text-xs text-slate-600">
                  {ESTADO_VISITA[v.estado] ?? v.estado}
                  {v.fecha_programada ? ` · ${v.fecha_programada}` : ""}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
