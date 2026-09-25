import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requierePermiso, type NivelPermiso } from "@/lib/permisos";
import { UsuariosAdmin, type DatosUsuariosAdmin } from "./UsuariosAdmin";

export default async function UsuariosPage() {
  await requierePermiso("configuracion", "responsable");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [usuariosRes, rolesRes, modulosRes, permisosRes] = await Promise.all([
    supabase.rpc("fn_listar_usuarios"),
    supabase.from("roles").select("id, nombre").order("nombre"),
    supabase.from("modulos").select("id, nombre, orden").order("orden"),
    supabase.from("permisos_rol").select("rol_id, modulo_id, nivel, ve_datos_sensibles"),
  ]);

  const error =
    usuariosRes.error?.message ??
    rolesRes.error?.message ??
    modulosRes.error?.message ??
    permisosRes.error?.message ??
    null;

  const datos: DatosUsuariosAdmin = {
    miId: user?.id ?? "",
    usuarios: ((usuariosRes.data ?? []) as {
      id: string;
      email: string;
      rol_id: string | null;
      ultimo_ingreso: string | null;
    }[]).map((u) => ({
      id: u.id,
      email: u.email,
      rolId: u.rol_id,
      ultimoIngreso: u.ultimo_ingreso,
    })),
    roles: (rolesRes.data ?? []) as { id: string; nombre: string }[],
    modulos: (modulosRes.data ?? []) as { id: string; nombre: string }[],
    permisos: ((permisosRes.data ?? []) as {
      rol_id: string;
      modulo_id: string;
      nivel: NivelPermiso;
      ve_datos_sensibles: boolean;
    }[]).map((p) => ({
      rolId: p.rol_id,
      moduloId: p.modulo_id,
      nivel: p.nivel,
      veDatosSensibles: p.ve_datos_sensibles,
    })),
  };

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 p-4 sm:p-6">
      <Link href="/configuracion" className="mb-2 inline-block text-sm text-slate-600">
        ← Configuración
      </Link>
      <h1 className="mb-4 text-center text-sm font-bold text-slate-900 sm:text-base">
        Usuarios y permisos
      </h1>

      {error && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          No se pudo cargar todo ({error}).
          {usuariosRes.error &&
            " Si dice que no encuentra fn_listar_usuarios, falta correr la migración 20260926000025 en Supabase."}
        </p>
      )}

      <UsuariosAdmin datos={datos} />
    </div>
  );
}
