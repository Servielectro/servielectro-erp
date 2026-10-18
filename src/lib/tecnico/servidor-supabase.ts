// La cola del técnico contra Supabase (producción). Todo con la sesión del técnico: la
// RLS decide (solo sus visitas; nada después de la firma del cliente).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { FirmaLocal, FotoLocal, JornadaLocal, SugerenciaLocal, VisitaLocal } from "./db";
import { guardar, leer } from "./db";
import { SinConexionError, type Servidor } from "./sync";

function revisar(error: { message: string } | null) {
  if (!error) return;
  if (/failed to fetch|network|load failed/i.test(error.message)) throw new SinConexionError(error.message);
  throw new Error(error.message);
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
      revisar(error);
    },

    async registrarFoto(f: FotoLocal, ruta) {
      const { error } = await supabase.from("visita_fotos").upsert(
        {
          id: f.id,
          visita_id: f.visitaId,
          jornada_id: f.jornadaId,
          storage_path: ruta,
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
      "id, titulo, descripcion_trabajo, direccion, cliente_nombre, contacto_sitio, telefono_sitio, tipo, estado, fecha_programada, fecha_fin_estimada",
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
      estadoPendiente: local?.estadoPendiente ?? false,
    });
  }
  return data?.length ?? 0;
}
