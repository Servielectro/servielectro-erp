"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { tienePermiso, type NivelPermiso } from "@/lib/permisos";
import { createAdminClient, hayClaveSecreta } from "@/lib/supabase/admin";

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

// El rol Cliente (portal del cliente, migración 134) NO se asigna desde aquí: sin su fila en
// cliente_usuarios la cuenta queda con el rol pero sin cliente ("Tu acceso al portal no está
// activo"). Se crea en Configuración → Usuarios del portal del cliente, que hace las dos cosas.
const AVISO_ROL_CLIENTE =
  "El rol «Cliente» se asigna desde Configuración → Usuarios del portal del cliente: ahí se escoge a qué cliente pertenece la cuenta.";

async function esRolCliente(supabase: Awaited<ReturnType<typeof createClient>>, rolId: string | null): Promise<boolean> {
  if (!rolId) return false;
  const { data } = await supabase.from("roles").select("nombre").eq("id", rolId).maybeSingle();
  return (data as { nombre: string } | null)?.nombre === "Cliente";
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
  if (await esRolCliente(ctx.supabase, rolId)) return { ok: false, error: AVISO_ROL_CLIENTE };
  // Dado de baja (migración 153): darle rol le devolvería los datos con la cuenta bloqueada. Se
  // reactiva primero. Si la 153 no está, la consulta falla y se sigue como antes.
  const { data: estado } = await ctx.supabase.from("perfiles").select("activo").eq("id", usuarioId).maybeSingle();
  if ((estado as { activo?: boolean } | null)?.activo === false) {
    return { ok: false, error: "Esa persona está dada de baja: reactívala primero (vuelve con el rol que tenía)." };
  }
  const { error } = await ctx.supabase
    .from("perfiles")
    .upsert({ id: usuarioId, rol_id: rolId }, { onConflict: "id" });
  if (error) return { ok: false, error: error.message };
  refrescar();
  return { ok: true };
}

/**
 * Crea el usuario en Supabase Auth (con la clave secreta, solo en el servidor) y le
 * asigna rol y nombre. El permiso se verifica ANTES de tocar la clave secreta; el perfil
 * se escribe con el cliente normal, así que la RLS de perfiles también lo exige.
 */
export async function crearUsuario(input: {
  nombre: string;
  email: string;
  password: string;
  rolId: string | null;
}): Promise<Resultado<{ id: string }>> {
  const ctx = await contexto();
  if (!ctx.ok) return ctx;
  if (!hayClaveSecreta()) {
    return {
      ok: false,
      error: "Falta configurar la clave secreta de Supabase en Vercel (SUPABASE_SECRET_KEY)",
    };
  }

  if (await esRolCliente(ctx.supabase, input.rolId)) return { ok: false, error: AVISO_ROL_CLIENTE };

  const nombre = input.nombre.trim();
  const email = input.email.trim().toLowerCase();
  if (!nombre) return { ok: false, error: "Falta el nombre" };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "El correo no es válido" };
  if (input.password.length < 8) {
    return { ok: false, error: "La contraseña inicial tiene que tener al menos 8 caracteres" };
  }

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: input.password,
    email_confirm: true, // lo crea el administrador: no hace falta que confirme el correo
    user_metadata: { nombre },
  });
  if (error || !data.user) {
    const yaExiste = /already|registered|exists/i.test(error?.message ?? "");
    return {
      ok: false,
      error: yaExiste ? "Ya existe un usuario con ese correo" : (error?.message ?? "No se pudo crear el usuario"),
    };
  }

  let { error: errPerfil } = await ctx.supabase
    .from("perfiles")
    .upsert({ id: data.user.id, rol_id: input.rolId, nombre }, { onConflict: "id" });
  if (errPerfil && /nombre/.test(errPerfil.message)) {
    // La migración 29 (columna nombre) todavía no se corrió: se guarda solo el rol.
    ({ error: errPerfil } = await ctx.supabase
      .from("perfiles")
      .upsert({ id: data.user.id, rol_id: input.rolId }, { onConflict: "id" }));
  }
  if (errPerfil) {
    // Sin perfil el usuario quedaría huérfano: se deshace la creación.
    await admin.auth.admin.deleteUser(data.user.id);
    return { ok: false, error: `No se pudo asignar el rol (${errPerfil.message})` };
  }

  refrescar();
  return { ok: true, id: data.user.id };
}

// ---------------------------------------------------------------- correo, baja y borrado
// Las tres tocan Auth con la clave secreta. Orden fijo en todas: permiso de responsable de
// Configuración (contexto) → candados → recién ahí createAdminClient(). La clave nunca sale del
// servidor ("server-only" en admin.ts) y no hay ningún atajo por variable de entorno.

const SIN_CLAVE = "Falta configurar la clave secreta de Supabase en Vercel (SUPABASE_SECRET_KEY)";
const FALTA_153 = "Falta correr la migración 20261203000153_usuarios_baja_y_borrado en Supabase";
// Bloqueo en Auth para la baja: GoTrue no tiene "para siempre"; 100 años lo es en la práctica.
const BAN_BAJA = "876000h";

const esUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

type Supa = Awaited<ReturnType<typeof createClient>>;

/** ¿Es una cuenta del portal del cliente? (rol Cliente o enlace en cliente_usuarios, activo o no) */
async function esCuentaDeCliente(supabase: Supa, usuarioId: string, rolId: string | null): Promise<boolean> {
  if (await esRolCliente(supabase, rolId)) return true;
  const { data } = await supabase.from("cliente_usuarios").select("perfil_id").eq("perfil_id", usuarioId).maybeSingle();
  return Boolean(data);
}
const AVISO_CUENTA_CLIENTE =
  "Esta es una cuenta del portal del cliente: se desactiva en Configuración → Usuarios del portal del cliente, no aquí.";

/**
 * Cambia el correo con el que entra la persona.
 *
 * DECISIÓN: el correo nuevo queda CONFIRMADO de una vez (email_confirm: true), igual que en
 * crearUsuario. Si quedara pendiente de confirmación, Supabase manda un enlace al correo nuevo y
 * hasta que no se abra la persona sigue entrando con el viejo (o, con la confirmación doble, con
 * ninguno de los dos si se pierde el correo); este ERP no manda correos de Auth y quien hace el
 * cambio es el administrador, que ya verificó el dato. Confirmarlo es lo que no deja a nadie afuera.
 *
 * La contraseña no cambia. La sesión abierta de esa persona NO se cierra: sigue trabajando, y la
 * próxima vez que inicie sesión tiene que usar el correo nuevo.
 */
export async function cambiarCorreo(usuarioId: string, correo: string): Promise<Resultado> {
  const ctx = await contexto();
  if (!ctx.ok) return ctx;
  if (!esUuid(usuarioId)) return { ok: false, error: "Datos no válidos" };
  const email = correo.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "El correo no es válido" };
  if (!hayClaveSecreta()) return { ok: false, error: SIN_CLAVE };

  // Antes de ir a Auth: ¿ya lo usa otra cuenta? fn_listar_usuarios trae TODAS las cuentas (con o
  // sin perfil) a quien es responsable de Configuración. Así el mensaje dice quién, en vez del
  // error crudo de Supabase. Auth lo vuelve a revisar abajo por si dos cambios se cruzan.
  const { data: cuentas } = await ctx.supabase.rpc("fn_listar_usuarios");
  const lista = (cuentas ?? []) as { id: string; email: string | null; nombre: string | null }[];
  const actual = lista.find((u) => u.id === usuarioId);
  if (!actual) return { ok: false, error: "No se encontró el usuario" };
  if ((actual.email ?? "").toLowerCase() === email) return { ok: false, error: "Ese ya es su correo" };
  const otro = lista.find((u) => u.id !== usuarioId && (u.email ?? "").toLowerCase() === email);
  if (otro) {
    return { ok: false, error: `Ese correo ya lo usa otra cuenta${otro.nombre ? ` (${otro.nombre})` : ""}. Cada persona entra con un correo distinto.` };
  }

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(usuarioId, { email, email_confirm: true });
  if (error) {
    const repetido = error.code === "email_exists" || /already|registered|exists/i.test(error.message);
    return { ok: false, error: repetido ? "Ese correo ya lo usa otra cuenta. Cada persona entra con un correo distinto." : `No se pudo cambiar el correo (${error.message})` };
  }
  refrescar();
  return { ok: true };
}

/**
 * Baja: deja de poder entrar, sale de los selectores, su nombre sigue en lo que hizo.
 * Orden: bloqueo en Auth (ban) → baja en la base (quita el rol, cierra sesiones, guarda motivo).
 * Si la base rechaza (candado, ya estaba de baja…), se deshace el bloqueo: nunca queda una cuenta
 * activa en la app pero bloqueada en Auth sin que nadie lo sepa.
 */
export async function darDeBaja(usuarioId: string, motivo: string): Promise<Resultado<{ aviso?: string }>> {
  const ctx = await contexto();
  if (!ctx.ok) return ctx;
  if (!esUuid(usuarioId)) return { ok: false, error: "Datos no válidos" };
  if (usuarioId === ctx.userId) return { ok: false, error: "No puedes darte de baja a ti mismo" };
  const limpio = motivo.trim();
  if (limpio.length < 4) return { ok: false, error: "Escribe el motivo de la baja" };

  const { data: perfil, error: errPerfil } = await ctx.supabase
    .from("perfiles")
    .select("rol_id, activo")
    .eq("id", usuarioId)
    .maybeSingle();
  if (errPerfil) return { ok: false, error: /activo/.test(errPerfil.message) ? FALTA_153 : errPerfil.message };
  const p = perfil as { rol_id: string | null; activo: boolean } | null;
  if (p && !p.activo) return { ok: false, error: "Esa persona ya estaba dada de baja" };
  if (await esCuentaDeCliente(ctx.supabase, usuarioId, p?.rol_id ?? null)) return { ok: false, error: AVISO_CUENTA_CLIENTE };
  const { data: otros, error: errOtros } = await ctx.supabase.rpc("fn_otros_responsables_config", { p_excepto: usuarioId });
  if (errOtros) return { ok: false, error: /fn_otros_responsables_config/.test(errOtros.message) ? FALTA_153 : errOtros.message };
  if ((otros as number) === 0) {
    return { ok: false, error: "No se puede: el sistema quedaría sin ningún responsable de Configuración activo" };
  }
  if (!hayClaveSecreta()) return { ok: false, error: SIN_CLAVE };

  const admin = createAdminClient();
  const { error: errBan } = await admin.auth.admin.updateUserById(usuarioId, { ban_duration: BAN_BAJA });
  if (errBan) return { ok: false, error: `No se pudo bloquear la cuenta en Auth (${errBan.message}). No se cambió nada.` };

  const { data: sesiones, error } = await ctx.supabase.rpc("fn_dar_de_baja_usuario", { p_usuario: usuarioId, p_motivo: limpio });
  if (error) {
    const { error: errDeshacer } = await admin.auth.admin.updateUserById(usuarioId, { ban_duration: "none" });
    const motivoError = /fn_dar_de_baja_usuario/.test(error.message) ? FALTA_153 : error.message;
    return {
      ok: false,
      error: errDeshacer
        ? `${motivoError}. Además la cuenta quedó bloqueada en Auth (${errDeshacer.message}): vuelve a intentar la baja o reactívala.`
        : motivoError,
    };
  }
  refrescar();
  // null = la base no dejó borrar auth.sessions. Igual queda afuera: sin rol la RLS no le deja ver
  // nada, y al vencer su token (≤ 1 h) no lo puede renovar porque está bloqueado.
  return sesiones === null
    ? { ok: true, aviso: "No se pudieron cerrar sus sesiones abiertas desde la base: ya no ve ningún dato, y en máximo una hora se le cierra sola." }
    : { ok: true };
}

/** Reactivar: vuelve con el rol que tenía. Primero se le quita el bloqueo de Auth. */
export async function reactivarUsuario(usuarioId: string): Promise<Resultado<{ sinRol: boolean }>> {
  const ctx = await contexto();
  if (!ctx.ok) return ctx;
  if (!esUuid(usuarioId)) return { ok: false, error: "Datos no válidos" };
  if (!hayClaveSecreta()) return { ok: false, error: SIN_CLAVE };

  const admin = createAdminClient();
  const { error: errBan } = await admin.auth.admin.updateUserById(usuarioId, { ban_duration: "none" });
  if (errBan) return { ok: false, error: `No se pudo quitar el bloqueo en Auth (${errBan.message}). No se cambió nada.` };

  const { data: rol, error } = await ctx.supabase.rpc("fn_reactivar_usuario", { p_usuario: usuarioId });
  if (error) {
    // Si la base dice que ya estaba activa, quitar el bloqueo era justo lo que faltaba: no se deshace.
    if (/ya estaba activa/.test(error.message)) {
      refrescar();
      return { ok: true, sinRol: false };
    }
    await admin.auth.admin.updateUserById(usuarioId, { ban_duration: BAN_BAJA });
    return { ok: false, error: /fn_reactivar_usuario/.test(error.message) ? FALTA_153 : error.message };
  }
  refrescar();
  return { ok: true, sinRol: !rol };
}

// Nombres para decir "a grandes rasgos" qué hizo la persona. Lo que no está aquí sale por prefijo
// (sst_ → SG-SST…) o con el nombre de la tabla tal cual.
const AREA_POR_TABLA: Record<string, string> = {
  eventos: "agenda",
  documentos: "documentos",
  tareas: "tareas",
  visitas: "visitas técnicas",
  licitaciones: "licitaciones",
  oportunidades: "CRM",
  cotizaciones: "cotizaciones",
  proyecto_personal: "proyectos",
  plantilla_versiones: "plantillas",
  cliente_portal_documentos: "portal del cliente",
  cliente_usuarios: "portal del cliente",
  perfiles: "usuarios",
};
const AREA_POR_PREFIJO: [string, string][] = [
  ["sst_", "SG-SST"],
  ["sgsst_", "SG-SST"],
  ["tarea", "tareas"],
  ["visita", "visitas técnicas"],
  ["licitacion", "licitaciones"],
  ["oportunidad", "CRM"],
  ["crm_", "CRM"],
  ["cotizacion", "cotizaciones"],
  ["proyecto", "proyectos"],
  ["acta", "actas"],
  ["reunion", "reuniones"],
  ["rrhh_", "RRHH"],
  ["contable_", "Contable"],
  ["caja", "caja menor"],
  ["marketing_", "marketing"],
  ["cliente", "clientes y portal"],
  ["evento", "agenda"],
  ["plantilla", "plantillas"],
];
function areaDeTabla(tabla: string): string {
  if (AREA_POR_TABLA[tabla]) return AREA_POR_TABLA[tabla];
  const prefijo = AREA_POR_PREFIJO.find(([p]) => tabla.startsWith(p));
  return prefijo ? prefijo[1] : tabla.replace(/_/g, " ");
}

/**
 * Borrar de verdad: solo una cuenta sin historial (creada por error). Si tiene registros, no se
 * intenta: se devuelve `historial` con las áreas, y la pantalla ofrece la baja.
 */
export async function eliminarUsuario(
  usuarioId: string,
): Promise<Resultado | { ok: false; error: string; historial: { area: string; filas: number }[] }> {
  const ctx = await contexto();
  if (!ctx.ok) return ctx;
  if (!esUuid(usuarioId)) return { ok: false, error: "Datos no válidos" };
  if (usuarioId === ctx.userId) return { ok: false, error: "No puedes eliminar tu propia cuenta" };

  const { data: perfil } = await ctx.supabase.from("perfiles").select("rol_id").eq("id", usuarioId).maybeSingle();
  const rolId = (perfil as { rol_id: string | null } | null)?.rol_id ?? null;
  if (await esCuentaDeCliente(ctx.supabase, usuarioId, rolId)) return { ok: false, error: AVISO_CUENTA_CLIENTE };

  const { data: otros, error: errOtros } = await ctx.supabase.rpc("fn_otros_responsables_config", { p_excepto: usuarioId });
  if (errOtros) return { ok: false, error: /fn_otros_responsables_config/.test(errOtros.message) ? FALTA_153 : errOtros.message };
  if ((otros as number) === 0) {
    return { ok: false, error: "No se puede: el sistema quedaría sin ningún responsable de Configuración activo" };
  }

  const { data: rastro, error: errRastro } = await ctx.supabase.rpc("fn_usuario_historial", { p_usuario: usuarioId });
  if (errRastro) return { ok: false, error: /fn_usuario_historial/.test(errRastro.message) ? FALTA_153 : errRastro.message };
  const filas = (rastro ?? []) as { tabla: string; columna: string; filas: number }[];
  if (filas.length > 0) {
    const porArea = new Map<string, number>();
    for (const f of filas) {
      const area = areaDeTabla(f.tabla);
      porArea.set(area, (porArea.get(area) ?? 0) + Number(f.filas));
    }
    return {
      ok: false,
      error: "Esta persona tiene registros en el sistema y no se puede borrar sin perder quién hizo qué.",
      historial: [...porArea].map(([area, n]) => ({ area, filas: n })).sort((a, b) => b.filas - a.filas),
    };
  }

  if (!hayClaveSecreta()) return { ok: false, error: SIN_CLAVE };
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(usuarioId);
  if (error) {
    // Algo apareció entre la revisión y el borrado, o una referencia sin llave conocida.
    const porLlave = /foreign key|violates|constraint|Database error/i.test(error.message);
    return {
      ok: false,
      error: porLlave
        ? "No se pudo borrar: la base todavía tiene registros de esta persona. Dale de baja en su lugar."
        : `No se pudo borrar la cuenta (${error.message})`,
    };
  }
  refrescar();
  return { ok: true };
}

export async function cambiarNombre(usuarioId: string, nombre: string): Promise<Resultado> {
  const ctx = await contexto();
  if (!ctx.ok) return ctx;
  const limpio = nombre.trim();
  if (!limpio) return { ok: false, error: "El nombre no puede quedar vacío" };
  // Solo se envía el nombre: si el perfil ya existe, el rol no se toca.
  const { error } = await ctx.supabase
    .from("perfiles")
    .upsert({ id: usuarioId, nombre: limpio }, { onConflict: "id" });
  if (error) {
    return {
      ok: false,
      error: /nombre/.test(error.message)
        ? "Falta correr la migración 29 (columna nombre) en Supabase"
        : error.message,
    };
  }
  refrescar();
  return { ok: true };
}

export async function cambiarDatosPersonales(
  usuarioId: string,
  cedula: string,
  telefono: string,
): Promise<Resultado> {
  const ctx = await contexto();
  if (!ctx.ok) return ctx;
  const cedulaLimpia = cedula.replace(/[^0-9]/g, "");
  if (cedula.trim() && !cedulaLimpia) return { ok: false, error: "La cédula solo lleva números" };
  const { error } = await ctx.supabase
    .from("perfiles")
    .update({ cedula: cedulaLimpia || null, telefono: telefono.trim() || null })
    .eq("id", usuarioId);
  if (error) {
    return {
      ok: false,
      error: /cedula|telefono/.test(error.message) ? "Falta correr la migración 45 en Supabase" : error.message,
    };
  }
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

export interface RecorteSeccion {
  moduloId: string;
  seccionId: string;
  /** false = no le aparece ni la puede abrir. */
  visible: boolean;
  /** Nivel rebajado (menor que el del módulo), o null = el del módulo. */
  nivel: NivelPermiso | null;
}

/**
 * Permisos por sección (migración 122): reemplaza los recortes de un rol. Solo se guarda lo que
 * QUITA algo (oculta o rebaja); lo demás es "como el módulo" y no lleva fila.
 */
export async function guardarSeccionesRol(rolId: string, recortes: RecorteSeccion[]): Promise<Resultado> {
  const ctx = await contexto();
  if (!ctx.ok) return ctx;
  const utiles = recortes.filter((r) => !r.visible || r.nivel !== null);
  if (utiles.some((r) => !/^[a-z_]+$/.test(r.moduloId) || !/^[a-z_]+$/.test(r.seccionId) || (r.nivel !== null && !NIVELES.includes(r.nivel)))) {
    return { ok: false, error: "Sección o nivel no válido" };
  }
  // Candado: tu propio rol no puede perder la pantalla desde la que se arregla esto.
  if (rolId === ctx.miRolId && utiles.some((r) => r.moduloId === "configuracion" && r.seccionId === "usuarios")) {
    return { ok: false, error: "A tu propio rol no se le puede recortar «Usuarios y permisos»: perderías el acceso a esta pantalla." };
  }
  if (utiles.length > 0) {
    const { error } = await ctx.supabase.from("permisos_rol_seccion").upsert(
      utiles.map((r) => ({ rol_id: rolId, modulo_id: r.moduloId, seccion_id: r.seccionId, visible: r.visible, nivel: r.visible ? r.nivel : null })),
      { onConflict: "rol_id,modulo_id,seccion_id" },
    );
    if (error) return { ok: false, error: error.message };
  }
  // Después se borran los recortes que ya no están (el mismo orden que la matriz de módulos).
  const { data: actuales, error: e1 } = await ctx.supabase.from("permisos_rol_seccion").select("modulo_id, seccion_id").eq("rol_id", rolId);
  if (e1) return { ok: false, error: e1.message };
  const quedan = new Set(utiles.map((r) => `${r.moduloId}/${r.seccionId}`));
  for (const a of (actuales ?? []) as { modulo_id: string; seccion_id: string }[]) {
    if (quedan.has(`${a.modulo_id}/${a.seccion_id}`)) continue;
    const { error } = await ctx.supabase.from("permisos_rol_seccion").delete().eq("rol_id", rolId).eq("modulo_id", a.modulo_id).eq("seccion_id", a.seccion_id);
    if (error) return { ok: false, error: error.message };
  }
  refrescar();
  return { ok: true };
}
