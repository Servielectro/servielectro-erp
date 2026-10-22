import "server-only";
import { createClient as clienteSinSesion } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Confirmación con contraseña para ELIMINAR (migración 62). Por qué está hecho así, para que
// nadie lo "simplifique":
//
//   - La contraseña NUNCA llega a la base. Se verifica acá, en el servidor, contra Supabase
//     Auth, y solo si es correcta se registra la marca "confirmó" con fn_reautenticacion_
//     registrar, que únicamente puede llamar la clave de servicio. Las funciones de eliminar de
//     la base exigen esa marca: aunque alguien llame a la base directo con su sesión, sin pasar
//     por acá, no borra nada. Si algún día la verificación se mueve a la base, esa propiedad se
//     pierde.
//   - Solo el usuario de la SESIÓN: el correo sale de la sesión, nunca de lo que mande la
//     pantalla. No sirve para probar contraseñas ajenas.
//   - La contraseña no se guarda, no se escribe en ningún registro ni mensaje de error, y vive
//     solo durante esta llamada. NADA de console.log acá.
//   - Mensaje genérico si falla. 5 fallos seguidos bloquean 15 minutos (lo cuenta la base).
//   - Una contraseña, un borrado (Jhojan, 2026-10-21): después de cada intento de borrar, la
//     marca se gasta (consumirConfirmacion). No habilitar una ventana sin que él la pida.

export type Confirmacion = { ok: true; perfilId: string } | { ok: false; error: string };

export async function confirmarConContrasena(contrasena: string): Promise<Confirmacion> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { ok: false, error: "Tu sesión venció: entra de nuevo." };
  if (!process.env.SUPABASE_SECRET_KEY) {
    return { ok: false, error: "Falta configurar la clave secreta de Supabase en Vercel (SUPABASE_SECRET_KEY)." };
  }
  if (!contrasena) return { ok: false, error: "Escribe tu contraseña." };

  const admin = createAdminClient();
  const { data: bloqueo } = await admin.rpc("fn_reautenticacion_bloqueada_hasta", { p_perfil_id: user.id });
  if (bloqueo) {
    const minutos = Math.max(1, Math.ceil((Date.parse(bloqueo as string) - Date.now()) / 60_000));
    return { ok: false, error: `Demasiados intentos. Espera ${minutos} min y vuelve a intentarlo.` };
  }

  // Un cliente aparte, sin cookies ni sesión guardada: probar la contraseña no toca la sesión
  // de quien está trabajando. La sesión que abre la prueba se cierra en el acto.
  const prueba = clienteSinSesion(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  let correcta = false;
  try {
    const { data, error } = await prueba.auth.signInWithPassword({ email: user.email, password: contrasena });
    correcta = !error && data.user?.id === user.id;
    if (data.session) await prueba.auth.signOut({ scope: "local" });
  } catch {
    correcta = false;
  }

  const { data: bloqueadaHasta, error: errRegistro } = await admin.rpc("fn_reautenticacion_registrar", {
    p_perfil_id: user.id,
    p_ok: correcta,
  });
  if (errRegistro) return { ok: false, error: "No se pudo registrar la confirmación. Intenta de nuevo." };
  if (!correcta) {
    return {
      ok: false,
      error: bloqueadaHasta ? "Contraseña incorrecta. Demasiados intentos: espera 15 min." : "Contraseña incorrecta.",
    };
  }
  return { ok: true, perfilId: user.id };
}

/** Gasta la confirmación: el siguiente borrado vuelve a pedir la contraseña. */
export async function consumirConfirmacion(perfilId: string) {
  await createAdminClient().rpc("fn_reautenticacion_consumir", { p_perfil_id: perfilId });
}
