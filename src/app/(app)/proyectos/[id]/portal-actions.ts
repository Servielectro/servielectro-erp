"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { tienePermiso } from "@/lib/permisos";
import { esCategoria } from "@/lib/cliente-portal";

// Portal del cliente, lado interno (migración 134): PUBLICAR un documento hacia el portal, retirarlo
// con motivo, y asignar personal a la obra. Todo exige Proyectos/trabajar: se revisa aquí y lo exige
// igual la RLS de cliente_portal_documentos y proyecto_personal. Nada de clave secreta: va con la
// sesión de quien publica.

type Resultado = { ok: true } | { ok: false; error: string };

async function contexto() {
  if (!(await tienePermiso("proyectos", "trabajar"))) {
    return { ok: false as const, error: "Publicar al portal o asignar personal requiere Proyectos en nivel «trabajar»." };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "La sesión se cerró: vuelve a entrar." };
  return { ok: true as const, supabase, userId: user.id };
}

const esUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
const esFecha = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

export type FuentePublicacion = { tipo: "documento"; id: string } | { tipo: "formato"; id: string };

export async function publicarAlPortal(input: {
  proyectoId: string;
  fuente: FuentePublicacion;
  categoria: string;
  titulo: string;
  descripcion: string;
}): Promise<Resultado> {
  const ctx = await contexto();
  if (!ctx.ok) return ctx;
  const { supabase } = ctx;
  const titulo = input.titulo.trim();
  if (!esUuid(input.proyectoId) || !esUuid(input.fuente.id)) return { ok: false, error: "Datos no válidos." };
  if (!esCategoria(input.categoria)) return { ok: false, error: "Escoge una categoría." };
  if (!titulo) return { ok: false, error: "Ponle un título: es lo que lee el cliente." };

  // El proyecto tiene que tener cliente: si no, nadie lo vería y es señal de que se escogió mal.
  const { data: proyecto } = await supabase.from("proyectos").select("id, cliente_id").eq("id", input.proyectoId).maybeSingle();
  if (!proyecto) return { ok: false, error: "No se encontró el proyecto." };
  if (!proyecto.cliente_id) return { ok: false, error: "Este proyecto no tiene cliente asignado: no hay a quién publicarle." };

  // La fuente tiene que ser de ESTE proyecto (si no, se le publicaría a un cliente lo de otro).
  if (input.fuente.tipo === "documento") {
    const { data: doc } = await supabase.from("proyecto_documentos").select("id, proyecto_id, archivado").eq("id", input.fuente.id).maybeSingle();
    if (!doc || doc.proyecto_id !== input.proyectoId) return { ok: false, error: "Ese documento no es de este proyecto." };
    if (doc.archivado) return { ok: false, error: "Ese documento está archivado: no se publica." };
  } else {
    const { data: f } = await supabase.from("sst_formatos").select("id, proyecto_id, estado").eq("id", input.fuente.id).maybeSingle();
    if (!f || f.proyecto_id !== input.proyectoId) return { ok: false, error: "Ese formato no es de este proyecto." };
    // Solo lo cerrado: un borrador cambia, un anulado no vale.
    if (f.estado !== "firmado" && f.estado !== "aprobado") return { ok: false, error: "Solo se publican formatos firmados o aprobados." };
  }

  const columna = input.fuente.tipo === "documento" ? "proyecto_documento_id" : "formato_id";
  const { data: yaEsta } = await supabase
    .from("cliente_portal_documentos")
    .select("id")
    .eq("proyecto_id", input.proyectoId)
    .eq(columna, input.fuente.id)
    .is("retirado_en", null)
    .limit(1);
  if (yaEsta?.length) return { ok: false, error: "Ese documento ya está publicado en el portal." };

  const { error } = await supabase.from("cliente_portal_documentos").insert({
    proyecto_id: input.proyectoId,
    categoria: input.categoria,
    titulo,
    descripcion: input.descripcion.trim() || null,
    [columna]: input.fuente.id,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/proyectos/${input.proyectoId}`);
  return { ok: true };
}

/** Retirar NO borra: queda la fila con quién, cuándo y por qué. El cliente deja de verlo. */
export async function retirarDelPortal(publicacionId: string, proyectoId: string, motivo: string): Promise<Resultado> {
  const ctx = await contexto();
  if (!ctx.ok) return ctx;
  const limpio = motivo.trim();
  if (!esUuid(publicacionId)) return { ok: false, error: "Datos no válidos." };
  if (limpio.length < 4) return { ok: false, error: "Escribe el motivo del retiro (queda en el registro)." };
  const { data, error } = await ctx.supabase
    .from("cliente_portal_documentos")
    .update({ retirado_en: new Date().toISOString(), retirado_por: ctx.userId, motivo_retiro: limpio })
    .eq("id", publicacionId)
    .is("retirado_en", null)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data?.length) return { ok: false, error: "Ya estaba retirado (o no se encontró)." };
  revalidatePath(`/proyectos/${proyectoId}`);
  return { ok: true };
}

export async function asignarPersonal(input: {
  proyectoId: string;
  empleadoId: string;
  rolEnObra: string;
  desde: string;
  hasta: string;
}): Promise<Resultado> {
  const ctx = await contexto();
  if (!ctx.ok) return ctx;
  if (!esUuid(input.proyectoId) || !esUuid(input.empleadoId)) return { ok: false, error: "Escoge a la persona." };
  if (!esFecha(input.desde)) return { ok: false, error: "Falta la fecha desde." };
  if (input.hasta && !esFecha(input.hasta)) return { ok: false, error: "La fecha hasta no es válida." };
  if (input.hasta && input.hasta < input.desde) return { ok: false, error: "«Hasta» no puede ser antes de «desde»." };
  const { error } = await ctx.supabase.from("proyecto_personal").insert({
    proyecto_id: input.proyectoId,
    empleado_id: input.empleadoId,
    rol_en_obra: input.rolEnObra.trim() || null,
    desde: input.desde,
    hasta: input.hasta || null,
  });
  if (error) {
    return { ok: false, error: /proyecto_personal_uk|duplicate/.test(error.message) ? "Esa persona ya está asignada a esta obra desde esa fecha." : error.message };
  }
  revalidatePath(`/proyectos/${input.proyectoId}`);
  return { ok: true };
}

/** Termina la asignación (pone «hasta»). Es lo normal cuando alguien sale de la obra. */
export async function terminarAsignacion(asignacionId: string, proyectoId: string, hasta: string): Promise<Resultado> {
  const ctx = await contexto();
  if (!ctx.ok) return ctx;
  if (!esUuid(asignacionId) || !esFecha(hasta)) return { ok: false, error: "Datos no válidos." };
  const { error } = await ctx.supabase.from("proyecto_personal").update({ hasta }).eq("id", asignacionId);
  if (error) return { ok: false, error: /proyecto_personal_fechas/.test(error.message) ? "«Hasta» no puede ser antes de «desde»." : error.message };
  revalidatePath(`/proyectos/${proyectoId}`);
  return { ok: true };
}

/** Quitar una asignación hecha por error (la política lo permite con Proyectos/trabajar). */
export async function quitarAsignacion(asignacionId: string, proyectoId: string): Promise<Resultado> {
  const ctx = await contexto();
  if (!ctx.ok) return ctx;
  if (!esUuid(asignacionId)) return { ok: false, error: "Datos no válidos." };
  const { error } = await ctx.supabase.from("proyecto_personal").delete().eq("id", asignacionId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/proyectos/${proyectoId}`);
  return { ok: true };
}
