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
    const params = new URLSearchParams({ error: error.message });
    if (next !== "/") params.set("next", next);
    redirect(`/login?${params}`);
  }

  redirect(next);
}
