"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { tienePermiso, type NivelPermiso } from "@/lib/permisos";

// Toda escritura exige ser responsable de Configuración — se revisa acá (servidor)
// y además lo exige la RLS de roles / permisos_rol / perfiles.
//
// Candados contra quedarse afuera: nadie cambia su propio rol, ni le quita a su
// propio rol el nivel responsable de Configuración, ni borra un rol con usuarios.
// Sin eso, un clic equivocado deja a Jhojan sin forma de arreglarlo desde la app.

type Resultado<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const NIVELES: NivelPermiso[] = ["consultar", "trabajar", "responsable"];

async function contexto() {
  if (!(await tienePermiso("configuracion", "responsable"))) {
    return { ok: false as const, error: "No tienes permiso para administrar usuarios" };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Sesión vencida" };
  const { data: perfil } = await supabase
    .from("perfiles")
    .select("rol_id")
    .eq("id", user.id)
    .maybeSingle();
  return {
    ok: true as const,
    supabase,
    userId: user.id,
    miRolId: (perfil?.rol_id as string | null) ?? null,
  };
}

function refrescar() {
  // Los permisos cambian qué ve cada quien en la home y el menú.
  revalidatePath("/", "layout");
}

export async function asignarRol(
  usuarioId: string,
  rolId: string | null,
): Promise<Resultado> {
  const ctx = await contexto();
  if (!ctx.ok) return ctx;
  if (usuarioId === ctx.userId) {
    return { ok: false, error: "No puedes cambiar tu propio rol" };
  }
  const { error } = await ctx.supabase
    .from("perfiles")
    .upsert({ id: usuarioId, rol_id: rolId }, { onConflict: "id" });
  if (error) return { ok: false, error: error.message };
  refrescar();
  return { ok: true };
}

export async function crearRol(nombre: string): Promise<Resultado<{ id: string }>> {
  const ctx = await contexto();
  if (!ctx.ok) return ctx;
  const limpio = nombre.trim();
  if (!limpio) return { ok: false, error: "El rol necesita un nombre" };
  const { data, error } = await ctx.supabase
    .from("roles")
    .insert({ nombre: limpio })
    .select("id")
    .single();
  if (error) {
    return {
      ok: false,
      error: error.code === "23505" ? "Ya existe un rol con ese nombre" : error.message,
    };
  }
  refrescar();
  return { ok: true, id: data.id as string };
}

export async function renombrarRol(rolId: string, nombre: string): Promise<Resultado> {
  const ctx = await contexto();
  if (!ctx.ok) return ctx;
  const limpio = nombre.trim();
  if (!limpio) return { ok: false, error: "El rol necesita un nombre" };
  const { error } = await ctx.supabase
    .from("roles")
    .update({ nombre: limpio })
    .eq("id", rolId);
  if (error) {
    return {
      ok: false,
      error: error.code === "23505" ? "Ya existe un rol con ese nombre" : error.message,
    };
  }
  refrescar();
  return { ok: true };
}

export async function eliminarRol(rolId: string): Promise<Resultado> {
  const ctx = await contexto();
  if (!ctx.ok) return ctx;
  if (rolId === ctx.miRolId) {
    return { ok: false, error: "No puedes eliminar tu propio rol" };
  }
  const { count, error: errCount } = await ctx.supabase
    .from("perfiles")
    .select("id", { count: "exact", head: true })
    .eq("rol_id", rolId);
  if (errCount) return { ok: false, error: errCount.message };
  if (count) {
    return {
      ok: false,
      error: `El rol tiene ${count} usuario(s). Asígnales otro rol antes de eliminarlo.`,
    };
  }
  const { error } = await ctx.supabase.from("roles").delete().eq("id", rolId);
  if (error) return { ok: false, error: error.message };
  refrescar();
  return { ok: true };
}

export interface FilaPermiso {
  moduloId: string;
  nivel: NivelPermiso;
  veDatosSensibles: boolean;
}

/** Reemplaza la matriz completa de un rol: módulo que no viene = sin acceso. */
export async function guardarPermisosRol(
  rolId: string,
  filas: FilaPermiso[],
): Promise<Resultado> {
  const ctx = await contexto();
  if (!ctx.ok) return ctx;

  if (
    filas.some((f) => !NIVELES.includes(f.nivel) || !/^[a-z_]+$/.test(f.moduloId))
  ) {
    return { ok: false, error: "Nivel de permiso no válido" };
  }
  if (
    rolId === ctx.miRolId &&
    !filas.some((f) => f.moduloId === "configuracion" && f.nivel === "responsable")
  ) {
    return {
      ok: false,
      error:
        "Tu propio rol tiene que seguir siendo responsable de Configuración — si no, perderías el acceso a esta pantalla.",
    };
  }

  // Primero se escriben las filas que quedan y después se borran las demás: así el
  // rol nunca pasa por un momento "sin nada" si algo falla a mitad de camino.
  if (filas.length > 0) {
    const { error } = await ctx.supabase.from("permisos_rol").upsert(
      filas.map((f) => ({
        rol_id: rolId,
        modulo_id: f.moduloId,
        nivel: f.nivel,
        ve_datos_sensibles: f.veDatosSensibles,
      })),
      { onConflict: "rol_id,modulo_id" },
    );
    if (error) return { ok: false, error: error.message };
  }

  let borrar = ctx.supabase.from("permisos_rol").delete().eq("rol_id", rolId);
  if (filas.length > 0) {
    borrar = borrar.not(
      "modulo_id",
      "in",
      `(${filas.map((f) => `"${f.moduloId}"`).join(",")})`,
    );
  }
  const { error } = await borrar;
  if (error) return { ok: false, error: error.message };

  refrescar();
  return { ok: true };
}
