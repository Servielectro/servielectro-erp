import "server-only";
import { createClient } from "@supabase/supabase-js";

// Cliente con la clave SECRETA de Supabase (salta la RLS). Solo para lo que el cliente
// normal no puede hacer por diseño: crear usuarios de Auth. Nunca se importa desde un
// componente de cliente ("server-only" rompe el build si alguien lo intenta), la
// variable NO lleva prefijo NEXT_PUBLIC_, y quien la usa tiene que haber verificado
// antes el permiso del usuario en el servidor.
//
// La clave la configura Jhojan directamente en Vercel (Settings → Environment
// Variables → SUPABASE_SECRET_KEY); no vive en el repo ni la maneja nadie más.

export function hayClaveSecreta(): boolean {
  return Boolean(process.env.SUPABASE_SECRET_KEY);
}

export function createAdminClient() {
  const clave = process.env.SUPABASE_SECRET_KEY;
  if (!clave) throw new Error("Falta SUPABASE_SECRET_KEY en el servidor");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, clave, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
