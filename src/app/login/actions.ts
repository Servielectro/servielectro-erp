"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { destinoSeguro } from "@/lib/inactividad";

export async function login(formData: FormData) {
  const supabase = await createClient();

  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  // A dónde volver (p. ej. la cotización en curso tras un cierre por inactividad).
  const next = destinoSeguro(formData.get("next"));

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // Cuenta dada de baja en Configuración → Usuarios (bloqueada en Auth): se dice claro, no "User is banned".
    const mensaje =
      error.code === "user_banned"
        ? "Tu usuario está dado de baja. Si es un error, habla con el administrador del sistema."
        : error.message;
    const params = new URLSearchParams({ error: mensaje });
    if (next !== "/") params.set("next", next);
    redirect(`/login?${params}`);
  }

  redirect(next);
}
