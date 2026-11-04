import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requierePermiso } from "@/lib/permisos";
import { hayClaveSecreta } from "@/lib/supabase/admin";
import { UsuariosPortal, type UsuarioPortal } from "./UsuariosPortal";

// Usuarios del portal del cliente (migración 134): crear la cuenta con rol Cliente y enlazarla a su
// cliente en cliente_usuarios; activar y desactivar (con motivo).
export default async function PortalClienteConfigPage() {
  await requierePermiso("configuracion", "responsable");
  const supabase = await createClient();

  const [enlacesRes, usuariosRes, clientesRes, rolRes] = await Promise.all([
    supabase.from("cliente_usuarios").select("perfil_id, cliente_id, cargo, activo, creado_en, desactivado_en, motivo_desactivacion").order("creado_en", { ascending: false }),
    supabase.rpc("fn_listar_usuarios"),
    supabase.from("clientes").select("id, nombre, nit").eq("activo", true).order("nombre"),
    supabase.from("roles").select("id").eq("nombre", "Cliente").maybeSingle(),
  ]);
  const rolId = (rolRes.data as { id: string } | null)?.id ?? null;
  const permisosRolRes = rolId ? await supabase.from("permisos_rol").select("modulo_id").eq("rol_id", rolId) : { data: [] };
  const modulosExtra = ((permisosRolRes.data ?? []) as { modulo_id: string }[]).map((p) => p.modulo_id).filter((m) => m !== "cliente");

  const enlaces = (enlacesRes.data ?? []) as {
    perfil_id: string;
    cliente_id: string;
    cargo: string | null;
    activo: boolean;
    creado_en: string;
    desactivado_en: string | null;
    motivo_desactivacion: string | null;
  }[];
  const usuarios = new Map(
    ((usuariosRes.data ?? []) as { id: string; email: string; nombre?: string | null; rol_id: string | null; ultimo_ingreso: string | null }[]).map((u) => [u.id, u]),
  );
  const clientes = (clientesRes.data ?? []) as { id: string; nombre: string; nit: string | null }[];
  // Los nombres de clientes de enlaces viejos (si el cliente se inactivó, no viene en la lista de arriba).
  const faltan = [...new Set(enlaces.map((e) => e.cliente_id))].filter((id) => !clientes.some((c) => c.id === id));
  const extraRes = faltan.length ? await supabase.from("clientes").select("id, nombre, nit").in("id", faltan) : { data: [] };
  const nombreCliente = new Map([...clientes, ...((extraRes.data ?? []) as typeof clientes)].map((c) => [c.id, c.nombre]));

  const lista: UsuarioPortal[] = enlaces.map((e) => {
    const u = usuarios.get(e.perfil_id);
    return {
      perfilId: e.perfil_id,
      email: u?.email ?? "—",
      nombre: u?.nombre ?? null,
      cliente: nombreCliente.get(e.cliente_id) ?? "(cliente sin permiso de lectura)",
      cargo: e.cargo,
      activo: e.activo,
      creadoEn: e.creado_en,
      ultimoIngreso: u?.ultimo_ingreso ?? null,
      desactivadoEn: e.desactivado_en,
      motivo: e.motivo_desactivacion,
      rolEsCliente: !!rolId && u?.rol_id === rolId,
    };
  });

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 p-4 sm:p-6">
      <Link href="/configuracion" className="mb-2 inline-flex min-h-11 items-center text-sm text-slate-600">
        ← Configuración
      </Link>
      <h1 className="mb-1 text-center text-sm font-bold text-slate-900">Usuarios del portal del cliente</h1>
      <p className="mb-4 text-center text-xs text-slate-600">
        El cliente entra con su propio usuario y ve solo lo que se le publica desde la ficha del proyecto, el personal asignado a su obra y las actas que debe firmar.
      </p>
      {(enlacesRes.error || clientesRes.error) && (
        <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">No se pudo cargar todo ({enlacesRes.error?.message ?? clientesRes.error?.message}).</p>
      )}
      {!rolId && <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">No existe el rol «Cliente». Falta la migración 20261203000134.</p>}
      {modulosExtra.length > 0 && (
        <p className="mb-3 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
          ⚠ El rol «Cliente» tiene módulos del ERP ({modulosExtra.join(", ")}). Un usuario externo con ese rol los vería. Quítaselos en{" "}
          <Link href="/configuracion/usuarios" className="underline">
            Usuarios y permisos
          </Link>
          : el rol Cliente solo debe tener «Portal del cliente».
        </p>
      )}
      <UsuariosPortal usuarios={lista} clientes={clientes} puedeCrear={hayClaveSecreta() && !!rolId && modulosExtra.length === 0} />
    </div>
  );
}
