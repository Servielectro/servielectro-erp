// La cola del técnico contra Supabase (producción). Todo con la sesión del técnico: la
// RLS decide (solo sus visitas; nada después de la firma del cliente).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { FirmaLocal, FotoLocal, JornadaLocal, SugerenciaLocal, VisitaLocal } from "./db";
import { guardar, leer } from "./db";
import { ErrorPermanente, SinConexionError, type Servidor } from "./sync";

// Códigos de Postgres que reintentar no arregla: excepción del candado o de una regla
// (P0001), sin permiso por RLS (42501), y datos que la base no acepta.
const PERMANENTES = new Set(["P0001", "42501", "23502", "23503", "23505", "23514", "22P02", "22007", "22008", "22003", "22001"]);

const AVISAR = " Avisa a la oficina.";

/**
 * Traduce el error del servidor a lo que la cola necesita saber: sin señal (se corta la
 * vuelta), permanente (no se reintenta; mensaje en palabras para el técnico) u otro
 * (servidor caído, sesión vencida: se reintenta).
 */
function revisar(error: { message: string; code?: string; statusCode?: string | number } | null) {
  if (!error) return;
  const mensaje = error.message ?? "";
  if (/failed to fetch|networkerror|network request failed|load failed|fetch failed/i.test(mensaje)) {
    throw new SinConexionError(mensaje);
  }
  const estadoHttp = String(error.statusCode ?? "");
  if (/jwt|token|PGRST301/i.test(`${mensaje} ${error.code ?? ""}`) || estadoHttp === "401") {
    throw new Error("Sesión vencida: entra de nuevo a la app con señal para terminar de subir.");
  }
  const sinPermiso =
    error.code === "42501" || estadoHttp === "403" || /row-level security|permission denied/i.test(mensaje);
  if (sinPermiso) {
    throw new ErrorPermanente(`No se subió: no tienes permiso sobre esta visita (¿te la reasignaron?).${AVISAR}`);
  }
  if (error.code === "P0001") {
    // Mensaje del candado o de una regla, ya escrito en palabras en la base.
    throw new ErrorPermanente(`No se subió: ${mensaje.replace(/\.$/, "")}.${AVISAR}`);
  }
  if ((error.code && PERMANENTES.has(error.code)) || estadoHttp === "400" || estadoHttp === "413") {
    throw new ErrorPermanente(`No se subió: el servidor no aceptó el dato (${mensaje}).${AVISAR}`);
  }
  throw new Error(mensaje || "El servidor no respondió bien; se vuelve a intentar.");
}

export function servidorSupabase(supabase: SupabaseClient): Servidor {
  return {
    async actualizarEstadoVisita(id, estado) {
      const { error } = await supabase.from("visitas").update({ estado }).eq("id", id);
      revisar(error);
    },

    async guardarJornada(j: JornadaLocal) {
      const { error } = await supabase.from("visita_jornadas").upsert(
        {
          id: j.id,
          visita_id: j.visitaId,
          fecha: j.fecha,
          check_in_en: j.checkInEn,
          check_in_gps_estado: j.checkIn?.estado ?? null,
          check_in_lat: j.checkIn?.lat ?? null,
          check_in_lng: j.checkIn?.lng ?? null,
          check_in_precision_m: j.checkIn?.precisionM ?? null,
          check_out_en: j.checkOutEn,
          check_out_gps_estado: j.checkOut?.estado ?? null,
          check_out_lat: j.checkOut?.lat ?? null,
          check_out_lng: j.checkOut?.lng ?? null,
          check_out_precision_m: j.checkOut?.precisionM ?? null,
          labor_ejecutada: j.laborEjecutada || null,
          no_ejecutado: j.noEjecutado || null,
          pendiente: j.pendiente || null,
          observaciones: j.observaciones || null,
          // Solo al salir (columnas de la migración 48).
          ...(j.fotosAlSalir != null
            ? { fotos_al_salir: j.fotosAlSalir, motivo_fotos_incompletas: j.motivoFotosIncompletas ?? null }
            : {}),
        },
        { onConflict: "id" },
      );
      revisar(error);
    },

    async guardarSugerencia(s: SugerenciaLocal) {
      const { error } = await supabase.from("visita_sugerencias").upsert(
        {
          id: s.id,
          visita_id: s.visitaId,
          jornada_id: s.jornadaId,
          descripcion: s.descripcion,
          cantidad: s.cantidad,
          unidad: s.unidad || null,
          motivo: s.motivo || null,
          requerido_para: s.requeridoPara ?? null,
          sugerida_en: s.sugeridaEn,
        },
        { onConflict: "id", ignoreDuplicates: true },
      );
      revisar(error);
    },

    async subirArchivo(ruta, blob, tipo) {
      const { error } = await supabase.storage.from("visitas").upload(ruta, blob, {
        contentType: tipo,
        upsert: false,
      });
      // Reintento de algo que ya había subido: no es error.
      if (error && /already exists|duplicate|409/i.test(`${error.message} ${(error as { statusCode?: string }).statusCode ?? ""}`)) return;
      revisar(error as { message: string; statusCode?: string } | null);
    },

    async registrarFoto(f: FotoLocal, ruta) {
      const { error } = await supabase.from("visita_fotos").upsert(
        {
          id: f.id,
          visita_id: f.visitaId,
          jornada_id: f.jornadaId,
          storage_path: ruta,
          momento: f.momento ?? null,
          tomada_en: f.tomadaEn,
          bytes: f.bytes,
          sha256: f.sha256,
        },
        { onConflict: "id", ignoreDuplicates: true },
      );
      revisar(error);
    },

    async registrarFirma(f: FirmaLocal, ruta) {
      const { error } = await supabase.from("visita_firmas").upsert(
        {
          id: f.id,
          visita_id: f.visitaId,
          tipo: f.tipo,
          nombre: f.nombre,
          cedula: f.cedula,
          cargo: f.cargo || null,
          imagen_path: ruta,
          firmada_en: f.firmadaEn,
          gps_estado: f.ubicacion.estado,
          lat: f.ubicacion.lat,
          lng: f.ubicacion.lng,
          hash_contenido: f.hashContenido,
        },
        { onConflict: "visita_id,tipo", ignoreDuplicates: true },
      );
      revisar(error);
    },
  };
}

/** Baja las visitas asignadas al técnico. Lo que el técnico cambió y no subió, se respeta. */
export async function descargarVisitas(supabase: SupabaseClient, tecnicoId: string): Promise<number> {
  const { data, error } = await supabase
    .from("visitas")
    .select(
      "id, titulo, descripcion_trabajo, direccion, cliente_nombre, contacto_sitio, telefono_sitio, tipo, estado, fecha_programada, fecha_fin_estimada, fotos_minimas_dia",
    )
    .eq("tecnico_id", tecnicoId)
    .in("estado", ["programada", "en_curso", "firmada"])
    .order("fecha_programada", { ascending: true });
  revisar(error);
  for (const v of data ?? []) {
    const local = await leer<VisitaLocal>("visitas", v.id);
    await guardar<VisitaLocal>("visitas", {
      id: v.id,
      titulo: v.titulo,
      descripcionTrabajo: v.descripcion_trabajo,
      direccion: v.direccion,
      clienteNombre: v.cliente_nombre,
      contactoSitio: v.contacto_sitio,
      telefonoSitio: v.telefono_sitio,
      tipo: v.tipo,
      // Si el técnico la marcó en curso sin señal, gana lo local hasta que suba.
      estado: local?.estadoPendiente ? local.estado : v.estado,
      fechaProgramada: v.fecha_programada,
      fechaFinEstimada: v.fecha_fin_estimada,
      fotosMinimasDia: v.fotos_minimas_dia,
      estadoPendiente: local?.estadoPendiente ?? false,
    });
  }
  return data?.length ?? 0;
}
