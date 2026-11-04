import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { tienePermiso } from "@/lib/permisos";
import { getClientesActivos, type ClienteResumen } from "@/lib/supabase/clientes";
import { COLUMNAS_PROYECTO, ESTADO_PROYECTO, type Proyecto } from "@/lib/supabase/proyectos";
import { FormProyecto } from "../FormProyecto";
import { ESTADO_FORMATO } from "@/lib/sst/plantillas";
import { hoyBogota } from "@/lib/cliente-portal";
import { estadoEnvio } from "@/lib/sst/envio-cliente";
import { PortalProyecto, type DocumentoObra, type FormatoCerrado, type Publicacion } from "./PortalProyecto";
import { PersonalObra, type Asignacion, type PersonaElegible } from "./PersonalObra";
import { LoQueVeElCliente, type PublicadoVisible } from "./LoQueVeElCliente";

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
    supabase.from("sst_formatos").select("id, plantilla_id, fecha, estado, enviado_cliente_en").eq("ambito", "proyectos").eq("proyecto_id", id).order("fecha", { ascending: false }).limit(50),
    supabase.from("sst_plantillas").select("id, nombre, firmas").eq("ambito", "proyectos"),
  ]);
  // Portal del cliente (migración 134): lo publicado, lo que se puede publicar y el personal en obra.
  const [publicacionesRes, documentosRes, cerradosRes, plantillasTodasRes, asignacionesRes, personalRes] = await Promise.all([
    supabase
      .from("cliente_portal_documentos")
      .select("id, categoria, titulo, descripcion, proyecto_documento_id, formato_id, path, bucket, publicado_en, retirado_en, motivo_retiro")
      .eq("proyecto_id", id)
      .order("publicado_en", { ascending: false }),
    supabase.from("proyecto_documentos").select("id, tipo, nombre, path, reservado").eq("proyecto_id", id).eq("archivado", false).order("subido_en", { ascending: false }),
    // Solo lo cerrado se publica. La RLS deja ver los de los ámbitos que esta persona ve.
    supabase.from("sst_formatos").select("id, plantilla_id, fecha, ambito").eq("proyecto_id", id).in("estado", ["firmado", "aprobado"]).order("fecha", { ascending: false }).limit(100),
    supabase.from("sst_plantillas").select("id, nombre"),
    supabase.from("proyecto_personal").select("id, empleado_id, rol_en_obra, desde, hasta").eq("proyecto_id", id).order("desde"),
    supabase.rpc("fn_sst_personal"),
  ]);
  const publicadasActivas = new Set(
    ((publicacionesRes.data ?? []) as { formato_id: string | null; retirado_en: string | null }[]).filter((x) => x.formato_id && !x.retirado_en).map((x) => x.formato_id as string),
  );
  // Para «Lo que ve el cliente»: si nadie del cliente tiene usuario, nadie lo ve (solo con permiso de Configuración).
  const usuariosClienteRes = p.cliente_id
    ? await supabase.from("cliente_usuarios").select("perfil_id", { count: "exact", head: true }).eq("cliente_id", p.cliente_id).eq("activo", true)
    : null;
  const veUsuariosCliente = await tienePermiso("configuracion", "consultar");
  const usuariosActivos = usuariosClienteRes && !usuariosClienteRes.error && veUsuariosCliente ? (usuariosClienteRes.count ?? 0) : null;
  const nombreCualquierPlantilla = new Map(((plantillasTodasRes.data ?? []) as { id: string; nombre: string }[]).map((x) => [x.id, x.nombre]));
  const formatosCerrados: FormatoCerrado[] = ((cerradosRes.data ?? []) as { id: string; plantilla_id: string; fecha: string; ambito: string }[]).map((f) => ({
    id: f.id,
    nombre: nombreCualquierPlantilla.get(f.plantilla_id) ?? "Formato",
    fecha: f.fecha,
    ambito: f.ambito,
  }));

  const actas = (actasRes.data ?? []) as { id: string; plantilla_id: string; fecha: string; estado: string; enviado_cliente_en: string | null }[];
  const plantillasActas = (plantillasActasRes.data ?? []) as { id: string; nombre: string; firmas: { rol: string }[] | null }[];
  const nombrePlantilla = new Map(plantillasActas.map((x) => [x.id, x.nombre]));
  // Migración 137: estado de cada acta frente al cliente (solo las que llevan firma del contratante).
  const conContratante = new Set(plantillasActas.filter((x) => (x.firmas ?? []).some((r) => r.rol === "sst_cliente")).map((x) => x.id));
  const actasCliente = actas.filter((a) => conContratante.has(a.plantilla_id));
  const firmasContratanteRes = actasCliente.length
    ? await supabase.from("sst_formato_firmas").select("formato_id").eq("rol", "sst_cliente").in("formato_id", actasCliente.map((a) => a.id))
    : { data: [] };
  const firmoContratante = new Set(((firmasContratanteRes.data ?? []) as { formato_id: string }[]).map((x) => x.formato_id));
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

      {/* Datos del proyecto PLEGADOS (Jhojan: comían media pantalla antes de lo que importa). Una línea
          de resumen; se abre para corregir y guardar. <details> funciona sin JavaScript. */}
      <details className="group rounded-lg border border-slate-300 bg-white">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-sm [&::-webkit-details-marker]:hidden">
          <span className="min-w-0 truncate text-slate-700">
            <span className="font-semibold text-slate-900">{p.clientes?.nombre ?? (p.cliente_id ? "Cliente" : "Sin cliente")}</span>
            {" · "}
            {p.fecha_inicio ?? "sin inicio"} → {p.fecha_fin_estimada ?? "sin fin"}
          </span>
          <span className="shrink-0 text-xs font-semibold text-slate-600 underline">
            <span className="group-open:hidden">{puedeEditar ? "Editar datos" : "Ver datos"}</span>
            <span className="hidden group-open:inline">Cerrar</span>
          </span>
        </summary>
        <div className="border-t border-slate-200 p-1">
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
        </div>
      </details>

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
                {conContratante.has(a.plantilla_id) && (
                  <p className="text-xs font-semibold text-slate-700">
                    {
                      estadoEnvio({
                        estado: a.estado,
                        enviadoEn: a.enviado_cliente_en,
                        firmoContratante: firmoContratante.has(a.id),
                        publicada: publicadasActivas.has(a.id),
                      }).texto
                    }
                  </p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
      {!proyectosTrabaja && <p className="mt-1 text-xs text-slate-500">Llenar actas requiere Proyectos en nivel “trabajar”.</p>}

      <Link href={`/proyectos/reuniones?proyecto=${p.id}`} className="mt-3 flex min-h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800">
        🎙 Reuniones de la obra (grabar, acta, compromisos)
      </Link>

      <LoQueVeElCliente
        tieneCliente={!!p.cliente_id}
        publicados={((publicacionesRes.data ?? []) as (PublicadoVisible & { retirado_en: string | null })[]).filter((x) => !x.retirado_en)}
        porFirmar={actasCliente
          .filter((a) => a.estado === "borrador" && a.enviado_cliente_en && !firmoContratante.has(a.id))
          .map((a) => ({ id: a.id, nombre: `${nombrePlantilla.get(a.plantilla_id) ?? "Acta"} · ${a.fecha}`, enviadoEn: a.enviado_cliente_en as string }))}
        personasHoy={((asignacionesRes.data ?? []) as Asignacion[]).filter((x) => x.desde <= hoyBogota() && (!x.hasta || x.hasta >= hoyBogota())).length}
        usuariosActivos={usuariosActivos}
      />

      <PortalProyecto
        proyectoId={p.id}
        tieneCliente={!!p.cliente_id}
        puedePublicar={proyectosTrabaja}
        publicaciones={(publicacionesRes.data ?? []) as Publicacion[]}
        documentos={(documentosRes.data ?? []) as DocumentoObra[]}
        formatos={formatosCerrados}
      />

      <PersonalObra
        proyectoId={p.id}
        puedeEditar={proyectosTrabaja}
        asignaciones={(asignacionesRes.data ?? []) as Asignacion[]}
        personas={(personalRes.data ?? []) as PersonaElegible[]}
        hoy={hoyBogota()}
      />

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
