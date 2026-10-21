"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { tienePermiso } from "@/lib/permisos";

// Crear y asignar visitas: Operativo/trabajar. La RLS lo exige igual (visitas_insert).

export interface NuevaVisita {
  titulo: string;
  clienteId: string | null;
  clienteNombre: string;
  direccion: string;
  contactoSitio: string;
  telefonoSitio: string;
  tipo: "visita" | "obra";
  tecnicoId: string | null;
  fechaProgramada: string;
  /** HH:MM, opcional: con ella se calcula el retraso. */
  horaProgramada: string;
  fechaFinEstimada: string;
  descripcionTrabajo: string;
  /** Mínimo de fotos por día (texto del formulario; vacío = sin mínimo). */
  fotosMinimasDia: string;
}

export async function crearVisita(v: NuevaVisita): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await tienePermiso("operativo", "trabajar"))) {
    return { ok: false, error: "Crear visitas requiere permiso de Operativo." };
  }
  if (!v.titulo.trim()) return { ok: false, error: "Falta el título de la visita." };
  if (!v.tecnicoId) return { ok: false, error: "Elige el técnico que la va a hacer." };
  if (!v.fechaProgramada) return { ok: false, error: "Falta la fecha." };
  const minimo = v.fotosMinimasDia.trim() ? Number(v.fotosMinimasDia) : null;
  if (minimo !== null && (!Number.isInteger(minimo) || minimo < 1 || minimo > 500)) {
    return { ok: false, error: "El mínimo de fotos es un número entero entre 1 y 500, o vacío." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("visitas").insert({
    titulo: v.titulo.trim(),
    cliente_id: v.clienteId,
    // Copia para el técnico, que no puede leer clientes (NIT, RUT, datos comerciales).
    cliente_nombre: v.clienteNombre.trim() || null,
    direccion: v.direccion.trim() || null,
    contacto_sitio: v.contactoSitio.trim() || null,
    telefono_sitio: v.telefonoSitio.trim() || null,
    tipo: v.tipo,
    tecnico_id: v.tecnicoId,
    fecha_programada: v.fechaProgramada,
    hora_programada: v.horaProgramada || null,
    fecha_fin_estimada: v.tipo === "obra" && v.fechaFinEstimada ? v.fechaFinEstimada : null,
    descripcion_trabajo: v.descripcionTrabajo.trim() || null,
    fotos_minimas_dia: minimo,
  });
  if (error) {
    return {
      ok: false,
      error: /cliente_nombre|contacto_sitio|telefono_sitio/.test(error.message)
        ? "Falta correr la migración 46 en la base."
        : /hora_programada/.test(error.message)
          ? "Falta correr la migración 59 en la base."
          : error.message,
    };
  }
  revalidatePath("/operativo");
  return { ok: true };
}

/**
 * Cierra una visita desde la pantalla del coordinador (migración 60): una obra en curso se da
 * por terminada; una visita firmada se cierra. Quién y cuándo los pone la base; la nota es
 * opcional. Las reglas (permiso, desde qué estado) las exige la base: acá solo se pide.
 */
export async function cerrarVisita(
  visitaId: string,
  nota: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await tienePermiso("operativo", "trabajar"))) {
    return { ok: false, error: "Cerrar una visita requiere permiso de Operativo." };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("visitas")
    .update({ estado: "cerrada", cierre_nota: nota.trim() || null })
    .eq("id", visitaId)
    .select("id");
  if (error) {
    return {
      ok: false,
      error: /cierre_nota|cerrada_en/.test(error.message) ? "Falta correr la migración 60 en la base." : error.message,
    };
  }
  if (!data || data.length === 0) return { ok: false, error: "No se encontró la visita o no tienes acceso a ella." };
  revalidatePath("/operativo");
  revalidatePath(`/operativo/visitas/${visitaId}`);
  return { ok: true };
}
