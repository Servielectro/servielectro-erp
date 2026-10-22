"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { confirmarConContrasena, consumirConfirmacion } from "@/lib/seguridad/reautenticar";

// ELIMINAR de verdad (migración 62): pide la contraseña cada vez. Archivar no pasa por acá.
// Orden: contraseña (servidor) → la base borra (todo o nada, exige la confirmación) → se gasta
// la confirmación SIEMPRE, salga bien o mal → en una visita, sus archivos por la API de Storage.
// Primero la base y después los archivos: si el almacenamiento falla quedan archivos sueltos
// (los recoge Configuración → "Archivos sin visita"), nunca filas apuntando a archivos borrados.

type Resultado = { ok: true; aviso: string | null } | { ok: false; error: string; ofrecerArchivar?: boolean };

const ofreceArchivar = (mensaje: string) => /Archívala|se archiva/i.test(mensaje);

export async function eliminarTareaDefinitivo(tareaId: string, motivo: string, contrasena: string): Promise<Resultado> {
  if (!motivo.trim()) return { ok: false, error: "Escribe por qué se elimina." };
  const conf = await confirmarConContrasena(contrasena);
  if (!conf.ok) return conf;
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("fn_eliminar_tarea", { p_tarea_id: tareaId, p_motivo: motivo.trim() });
    if (error) return { ok: false, error: error.message, ofrecerArchivar: ofreceArchivar(error.message) };
  } finally {
    await consumirConfirmacion(conf.perfilId);
  }
  revalidatePath("/operativo/tareas");
  revalidatePath("/planificacion");
  return { ok: true, aviso: null };
}

export async function eliminarVisitaDefinitivo(visitaId: string, motivo: string, contrasena: string): Promise<Resultado> {
  if (!motivo.trim()) return { ok: false, error: "Escribe por qué se elimina." };
  const conf = await confirmarConContrasena(contrasena);
  if (!conf.ok) return conf;
  let rutas: string[] = [];
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_eliminar_visita", { p_visita_id: visitaId, p_motivo: motivo.trim() });
    if (error) return { ok: false, error: error.message, ofrecerArchivar: ofreceArchivar(error.message) };
    rutas = ((data ?? []) as string[]).filter((r) => r.startsWith(`${visitaId}/`));
  } finally {
    await consumirConfirmacion(conf.perfilId);
  }

  revalidatePath("/operativo");
  // La visita ya no existe. Ahora sus archivos; si algo queda, se dice.
  const admin = createAdminClient();
  let aviso: string | null = null;
  try {
    if (rutas.length > 0) {
      const { error } = await admin.storage.from("visitas").remove(rutas);
      if (error) throw new Error(error.message);
    }
    const { data: quedan } = await admin.storage.from("visitas").list(visitaId, { limit: 1000 });
    const n = (quedan ?? []).filter((a) => a.id !== null).length;
    if (n > 0) aviso = `La visita se eliminó, pero quedaron ${n} archivos en el almacenamiento. Bórralos en Configuración → Archivos sin visita.`;
  } catch {
    aviso = "La visita se eliminó, pero sus archivos no se pudieron borrar ahora. Bórralos en Configuración → Archivos sin visita.";
  }
  return { ok: true, aviso };
}
