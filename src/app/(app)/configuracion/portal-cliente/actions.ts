"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { tienePermiso } from "@/lib/permisos";
import { createAdminClient, hayClaveSecreta } from "@/lib/supabase/admin";

// Usuarios del portal del cliente (migración 134). Exige Configuración/responsable: se revisa aquí
// ANTES de tocar la clave secreta, y lo exige además la RLS de perfiles y cliente_usuarios.
// La clave secreta se usa SOLO para crear la cuenta en Auth; el rol y el enlace con el cliente se
// escriben con la sesión de quien lo hace.

type Resultado<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const esUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

async function contexto() {
  if (!(await tienePermiso("configuracion", "responsable"))) {
    return { ok: false as const, error: "Crear usuarios del portal requiere Configuración en nivel «responsable»." };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "La sesión se cerró: vuelve a entrar." };
  return { ok: true as const, supabase, userId: user.id };
}

export async function crearUsuarioCliente(input: {
  clienteId: string;
  nombre: string;
  email: string;
  password: string;
  cargo: string;
  cedula: string;
}): Promise<Resultado<{ id: string }>> {
  const ctx = await contexto();
  if (!ctx.ok) return ctx;
  if (!hayClaveSecreta()) return { ok: false, error: "Falta configurar la clave secreta de Supabase en Vercel (SUPABASE_SECRET_KEY)." };

  const nombre = input.nombre.trim();
  const email = input.email.trim().toLowerCase();
  const cedula = input.cedula.replace(/[^0-9]/g, "");
  if (!esUuid(input.clienteId)) return { ok: false, error: "Escoge el cliente." };
  if (!nombre) return { ok: false, error: "Falta el nombre de la persona." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "El correo no es válido." };
  if (input.password.length < 10) return { ok: false, error: "La contraseña inicial tiene que tener al menos 10 caracteres." };

  // El rol Cliente lo creó la migración 134. Si no está, no se crea nada (sin rol no hay candado).
  const { data: rol } = await ctx.supabase.from("roles").select("id").eq("nombre", "Cliente").maybeSingle();
  if (!rol) return { ok: false, error: "No existe el rol «Cliente» (migración 20261203000134)." };
  // El rol Cliente no puede tener otro módulo: si alguien se lo agregó en la matriz, se frena aquí.
  const { data: permisosRol } = await ctx.supabase.from("permisos_rol").select("modulo_id").eq("rol_id", rol.id);
  const extra = ((permisosRol ?? []) as { modulo_id: string }[]).filter((p) => p.modulo_id !== "cliente");
  if (extra.length) {
    return { ok: false, error: `El rol «Cliente» tiene módulos del ERP (${extra.map((e) => e.modulo_id).join(", ")}). Quítaselos en Usuarios y permisos antes de crear usuarios externos.` };
  }

  const { data: cliente } = await ctx.supabase.from("clientes").select("id").eq("id", input.clienteId).maybeSingle();
  if (!cliente) return { ok: false, error: "No se encontró el cliente (o no tienes permiso de verlo)." };

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: input.password,
    email_confirm: true,
    user_metadata: { nombre, portal_cliente: true },
  });
  if (error || !data.user) {
    const yaExiste = /already|registered|exists/i.test(error?.message ?? "");
    return { ok: false, error: yaExiste ? "Ya existe un usuario con ese correo." : (error?.message ?? "No se pudo crear el usuario.") };
  }
  const nuevo = data.user.id;

  // Si algo falla después, se deshace la cuenta: un usuario sin enlace quedaría huérfano.
  const deshacer = async (motivo: string) => {
    await admin.auth.admin.deleteUser(nuevo);
    return { ok: false as const, error: motivo };
  };
  const { error: errPerfil } = await ctx.supabase
    .from("perfiles")
    .upsert({ id: nuevo, rol_id: rol.id, nombre, cedula: cedula || null }, { onConflict: "id" });
  if (errPerfil) return deshacer(`No se pudo asignar el rol Cliente (${errPerfil.message}).`);
  const { error: errEnlace } = await ctx.supabase.from("cliente_usuarios").insert({ perfil_id: nuevo, cliente_id: input.clienteId, cargo: input.cargo.trim() || null });
  if (errEnlace) return deshacer(`No se pudo enlazar con el cliente (${errEnlace.message}).`);

  revalidatePath("/configuracion/portal-cliente");
  return { ok: true, id: nuevo };
}

/** Desactivar exige motivo (lo exige también la base). La cuenta queda, pero el portal no le muestra nada. */
export async function desactivarUsuarioCliente(perfilId: string, motivo: string): Promise<Resultado> {
  const ctx = await contexto();
  if (!ctx.ok) return ctx;
  const limpio = motivo.trim();
  if (!esUuid(perfilId)) return { ok: false, error: "Datos no válidos." };
  if (limpio.length < 4) return { ok: false, error: "Escribe el motivo de la desactivación." };
  const { data, error } = await ctx.supabase
    .from("cliente_usuarios")
    .update({ activo: false, desactivado_en: new Date().toISOString(), desactivado_por: ctx.userId, motivo_desactivacion: limpio })
    .eq("perfil_id", perfilId)
    .eq("activo", true)
    .select("perfil_id");
  if (error) return { ok: false, error: error.message };
  if (!data?.length) return { ok: false, error: "Ya estaba desactivado (o no se encontró)." };
  revalidatePath("/configuracion/portal-cliente");
  return { ok: true };
}

/** Reactivar. Se conserva la última desactivación (fecha, quién y motivo) como rastro. */
export async function activarUsuarioCliente(perfilId: string): Promise<Resultado> {
  const ctx = await contexto();
  if (!ctx.ok) return ctx;
  if (!esUuid(perfilId)) return { ok: false, error: "Datos no válidos." };
  const { data, error } = await ctx.supabase.from("cliente_usuarios").update({ activo: true }).eq("perfil_id", perfilId).eq("activo", false).select("perfil_id");
  if (error) return { ok: false, error: error.message };
  if (!data?.length) return { ok: false, error: "Ya estaba activo (o no se encontró)." };
  revalidatePath("/configuracion/portal-cliente");
  return { ok: true };
}
