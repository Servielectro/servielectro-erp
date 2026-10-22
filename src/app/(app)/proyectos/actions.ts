"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { tienePermiso } from "@/lib/permisos";
import type { EstadoProyecto } from "@/lib/supabase/proyectos";

// Crear y editar proyectos a mano (migración 63): Proyectos/trabajar (o Comercial/trabajar).
// La RLS lo exige igual; el código automático, la cotización y el cliente los cuida la base.

export interface DatosProyecto {
  nombre: string;
  /** Vacío = automático (PRY-AAAA-NNN). */
  codigo: string;
  clienteId: string | null;
  estado: EstadoProyecto;
  fechaInicio: string;
  fechaFinEstimada: string;
  descripcion: string;
}

const ESTADOS: EstadoProyecto[] = ["EN_EJECUCION", "SUSPENDIDO", "CERRADO"];

async function puedeTrabajar() {
  return (await tienePermiso("proyectos", "trabajar")) || (await tienePermiso("comercial", "trabajar"));
}

function validar(d: DatosProyecto): string | null {
  if (!d.nombre.trim()) return "Falta el nombre del proyecto: es lo que ven los técnicos.";
  if (!ESTADOS.includes(d.estado)) return "Estado no válido.";
  if (d.fechaInicio && d.fechaFinEstimada && d.fechaFinEstimada < d.fechaInicio) {
    return "La fecha de fin no puede ser anterior a la de inicio.";
  }
  return null;
}

function traducir(mensaje: string): string {
  if (/proyectos_codigo_key|duplicate key/.test(mensaje)) return "Ya hay un proyecto con ese código.";
  if (/cotizacion_aprobada_id|descripcion|creado_por/.test(mensaje) && /null|column/.test(mensaje)) {
    return "Falta correr la migración 63 en la base.";
  }
  return mensaje;
}

export async function crearProyecto(d: DatosProyecto): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (!(await puedeTrabajar())) return { ok: false, error: "Crear proyectos requiere permiso del módulo Proyectos." };
  const invalido = validar(d);
  if (invalido) return { ok: false, error: invalido };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("proyectos")
    .insert({
      nombre: d.nombre.trim(),
      codigo: d.codigo.trim(),
      cliente_id: d.clienteId,
      estado: d.estado,
      fecha_inicio: d.fechaInicio || null,
      fecha_fin_estimada: d.fechaFinEstimada || null,
      descripcion: d.descripcion.trim() || null,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: traducir(error.message) };
  revalidatePath("/proyectos");
  return { ok: true, id: data.id };
}

export async function editarProyecto(id: string, d: DatosProyecto): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await puedeTrabajar())) return { ok: false, error: "Editar proyectos requiere permiso del módulo Proyectos." };
  const invalido = validar(d);
  if (invalido) return { ok: false, error: invalido };
  if (!d.codigo.trim()) return { ok: false, error: "El código no puede quedar vacío." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("proyectos")
    .update({
      nombre: d.nombre.trim(),
      codigo: d.codigo.trim(),
      cliente_id: d.clienteId,
      estado: d.estado,
      fecha_inicio: d.fechaInicio || null,
      fecha_fin_estimada: d.fechaFinEstimada || null,
      descripcion: d.descripcion.trim() || null,
    })
    .eq("id", id)
    .select("id");
  if (error) return { ok: false, error: traducir(error.message) };
  if (!data?.length) return { ok: false, error: "No se encontró el proyecto, o no tienes permiso para editarlo." };
  revalidatePath("/proyectos");
  revalidatePath(`/proyectos/${id}`);
  return { ok: true };
}
