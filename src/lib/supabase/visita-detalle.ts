import type { SupabaseClient } from "@supabase/supabase-js";

// Todo lo que el coordinador ve de una visita (pantalla /operativo/visitas/[id]). Lee con la
// sesión de quien mira: la RLS decide (operativo/consultar ve todas las visitas).
// Fotos y firmas viven en el bucket privado "visitas": se entregan con enlaces firmados de
// una hora; las fotos que ya pasaron a Drive, con su enlace de Drive.

const VIGENCIA_ENLACE_S = 60 * 60;

export interface VisitaDetalle {
  id: string;
  titulo: string;
  tipo: "visita" | "obra";
  estado: string;
  clienteNombre: string | null;
  direccion: string | null;
  contactoSitio: string | null;
  telefonoSitio: string | null;
  descripcionTrabajo: string | null;
  fechaProgramada: string | null;
  horaProgramada: string | null;
  fechaFinEstimada: string | null;
  fotosMinimasDia: number | null;
  sitio: { lat: number; lng: number; urlMaps: string | null } | null;
  tecnico: { id: string | null; nombre: string };
  creadaPor: string;
  creadaEn: string;
  vistoEn: string | null;
  firmadaEn: string | null;
  cierre: { en: string; por: string; nota: string | null } | null;
  jornadas: {
    id: string;
    fecha: string;
    checkInEn: string | null;
    checkInGps: string | null;
    checkOutEn: string | null;
    checkOutGps: string | null;
    laborEjecutada: string | null;
    noEjecutado: string | null;
    pendiente: string | null;
    observaciones: string | null;
    fotosAlSalir: string | null;
    motivoFotosIncompletas: string | null;
  }[];
  fotos: { id: string; jornadaId: string | null; momento: string | null; tomadaEn: string | null; url: string | null; enDrive: boolean }[];
  firmas: { tipo: "tecnico" | "cliente"; nombre: string; cedula: string; cargo: string | null; firmadaEn: string; url: string | null }[];
  sugerencias: {
    id: string;
    descripcion: string;
    cantidad: number | null;
    unidad: string | null;
    motivo: string | null;
    estado: string;
    requeridoPara: string | null;
    conCotizacion: boolean;
  }[];
  tareas: {
    id: string;
    titulo: string;
    estado: string;
    prioridad: string;
    asignados: { nombre: string; asignadoEn: string; vistoEn: string | null }[];
  }[];
  notas: { texto: string; autor: string | null; en: string }[];
}

export async function getVisitaDetalle(supabase: SupabaseClient, id: string): Promise<VisitaDetalle | null> {
  const { data: v, error } = await supabase
    .from("visitas")
    .select(
      "id, titulo, tipo, estado, cliente_nombre, direccion, contacto_sitio, telefono_sitio, descripcion_trabajo, fecha_programada, hora_programada, fecha_fin_estimada, fotos_minimas_dia, sitio_lat, sitio_lng, sitio_url_maps, tecnico_id, creada_por, created_at, visto_en, firmada_en, cerrada_en, cerrada_por, cierre_nota",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!v) return null;

  const [jornadasR, fotosR, firmasR, sugerenciasR, tareasR, notasR, personasR] = await Promise.all([
    supabase
      .from("visita_jornadas")
      .select(
        "id, fecha, check_in_en, check_in_gps_estado, check_out_en, check_out_gps_estado, labor_ejecutada, no_ejecutado, pendiente, observaciones, fotos_al_salir, motivo_fotos_incompletas",
      )
      .eq("visita_id", id)
      .order("fecha"),
    supabase
      .from("visita_fotos")
      .select("id, jornada_id, momento, tomada_en, storage_path, estado_archivo, drive_url, created_at")
      .eq("visita_id", id)
      .order("created_at"),
    supabase.from("visita_firmas").select("tipo, nombre, cedula, cargo, imagen_path, firmada_en").eq("visita_id", id),
    supabase
      .from("visita_sugerencias")
      .select("id, descripcion, cantidad, unidad, motivo, estado, requerido_para, cotizacion_id, sugerida_en")
      .eq("visita_id", id)
      .order("sugerida_en"),
    supabase
      .from("tareas")
      .select("id, titulo, estado, prioridad, tarea_asignados(perfil_id, asignado_en, visto_en)")
      .eq("visita_id", id)
      .eq("archivada", false)
      .order("created_at"),
    supabase.from("visita_notas_posteriores").select("texto, autor_nombre, created_at").eq("visita_id", id).order("created_at"),
    // Nombres: perfiles solo los lee Configuración; para Operativo está esta lista. Quien solo
    // consulta no la tiene: los nombres salen como "—" en vez de romper la pantalla.
    supabase.rpc("fn_personas_asignables"),
  ]);

  const nombres = new Map(((personasR.data ?? []) as { id: string; nombre: string }[]).map((p) => [p.id, p.nombre]));
  const nombre = (pid: string | null) => (pid ? (nombres.get(pid) ?? "—") : "—");

  // Enlaces firmados de fotos (las que siguen en Supabase) y firmas, en una sola llamada.
  const fotosFilas = (fotosR.data ?? []) as {
    id: string;
    jornada_id: string | null;
    momento: string | null;
    tomada_en: string | null;
    storage_path: string;
    estado_archivo: string;
    drive_url: string | null;
  }[];
  const firmasFilas = (firmasR.data ?? []) as {
    tipo: "tecnico" | "cliente";
    nombre: string;
    cedula: string;
    cargo: string | null;
    imagen_path: string;
    firmada_en: string;
  }[];
  const rutas = [
    ...fotosFilas.filter((f) => f.estado_archivo !== "drive").map((f) => f.storage_path),
    ...firmasFilas.map((f) => f.imagen_path),
  ];
  const enlaces = new Map<string, string>();
  if (rutas.length > 0) {
    const { data: firmados } = await supabase.storage.from("visitas").createSignedUrls(rutas, VIGENCIA_ENLACE_S);
    for (const f of firmados ?? []) if (f.path && f.signedUrl) enlaces.set(f.path, f.signedUrl);
  }

  const lat = v.sitio_lat === null ? null : Number(v.sitio_lat);
  const lng = v.sitio_lng === null ? null : Number(v.sitio_lng);

  return {
    id: v.id,
    titulo: v.titulo,
    tipo: v.tipo,
    estado: v.estado,
    clienteNombre: v.cliente_nombre,
    direccion: v.direccion,
    contactoSitio: v.contacto_sitio,
    telefonoSitio: v.telefono_sitio,
    descripcionTrabajo: v.descripcion_trabajo,
    fechaProgramada: v.fecha_programada,
    horaProgramada: v.hora_programada,
    fechaFinEstimada: v.fecha_fin_estimada,
    fotosMinimasDia: v.fotos_minimas_dia,
    sitio: lat !== null && lng !== null ? { lat, lng, urlMaps: v.sitio_url_maps } : null,
    tecnico: { id: v.tecnico_id, nombre: v.tecnico_id ? nombre(v.tecnico_id) : "Sin asignar" },
    creadaPor: nombre(v.creada_por),
    creadaEn: v.created_at,
    vistoEn: v.visto_en,
    firmadaEn: v.firmada_en,
    cierre: v.cerrada_en ? { en: v.cerrada_en, por: nombre(v.cerrada_por), nota: v.cierre_nota } : null,
    jornadas: ((jornadasR.data ?? []) as Record<string, string | null>[]).map((j) => ({
      id: j.id as string,
      fecha: j.fecha as string,
      checkInEn: j.check_in_en,
      checkInGps: j.check_in_gps_estado,
      checkOutEn: j.check_out_en,
      checkOutGps: j.check_out_gps_estado,
      laborEjecutada: j.labor_ejecutada,
      noEjecutado: j.no_ejecutado,
      pendiente: j.pendiente,
      observaciones: j.observaciones,
      fotosAlSalir: j.fotos_al_salir,
      motivoFotosIncompletas: j.motivo_fotos_incompletas,
    })),
    fotos: fotosFilas.map((f) => ({
      id: f.id,
      jornadaId: f.jornada_id,
      momento: f.momento,
      tomadaEn: f.tomada_en,
      url: f.estado_archivo === "drive" ? f.drive_url : (enlaces.get(f.storage_path) ?? null),
      enDrive: f.estado_archivo === "drive",
    })),
    firmas: firmasFilas
      .sort((a, b) => (a.tipo === b.tipo ? 0 : a.tipo === "tecnico" ? -1 : 1))
      .map((f) => ({
        tipo: f.tipo,
        nombre: f.nombre,
        cedula: f.cedula,
        cargo: f.cargo,
        firmadaEn: f.firmada_en,
        url: enlaces.get(f.imagen_path) ?? null,
      })),
    sugerencias: (
      (sugerenciasR.data ?? []) as {
        id: string;
        descripcion: string;
        cantidad: number | null;
        unidad: string | null;
        motivo: string | null;
        estado: string;
        requerido_para: string | null;
        cotizacion_id: string | null;
      }[]
    ).map((s) => ({
      id: s.id,
      descripcion: s.descripcion,
      cantidad: s.cantidad === null ? null : Number(s.cantidad),
      unidad: s.unidad,
      motivo: s.motivo,
      estado: s.estado,
      requeridoPara: s.requerido_para,
      conCotizacion: Boolean(s.cotizacion_id),
    })),
    tareas: (
      (tareasR.data ?? []) as {
        id: string;
        titulo: string;
        estado: string;
        prioridad: string;
        tarea_asignados: { perfil_id: string; asignado_en: string; visto_en: string | null }[];
      }[]
    ).map((t) => ({
      id: t.id,
      titulo: t.titulo,
      estado: t.estado,
      prioridad: t.prioridad,
      asignados: (t.tarea_asignados ?? []).map((a) => ({
        nombre: nombre(a.perfil_id),
        asignadoEn: a.asignado_en,
        vistoEn: a.visto_en,
      })),
    })),
    notas: ((notasR.data ?? []) as { texto: string; autor_nombre: string | null; created_at: string }[]).map((n) => ({
      texto: n.texto,
      autor: n.autor_nombre,
      en: n.created_at,
    })),
  };
}
