import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requierePermiso } from "@/lib/permisos";
import { GruposAdmin, type GrupoAdmin } from "./GruposAdmin";

// Grupos de usuarios (migración 53): el atajo para compartir tareas y eventos sin listar
// diez personas. Los arma solo configuracion/responsable (un grupo reparte acceso). No se
// borran: se archivan. El historial lo escriben los triggers.
export default async function GruposPage() {
  await requierePermiso("configuracion", "responsable");
  const supabase = await createClient();

  const [gruposRes, miembrosRes, eventosRes, usuariosRes] = await Promise.all([
    supabase.from("grupos").select("id, nombre, descripcion, archivado").order("nombre"),
    supabase.from("grupo_miembros").select("grupo_id, perfil_id"),
    supabase
      .from("grupo_eventos")
      .select("id, grupo_id, tipo, detalle, actor_nombre, creado_en")
      .order("creado_en", { ascending: false })
      .limit(500),
    supabase.rpc("fn_listar_usuarios"),
  ]);

  const error = gruposRes.error?.message ?? miembrosRes.error?.message ?? null;
  const miembros = (miembrosRes.data ?? []) as { grupo_id: string; perfil_id: string }[];
  const eventos = (eventosRes.data ?? []) as {
    id: string;
    grupo_id: string;
    tipo: string;
    detalle: Record<string, string | null>;
    actor_nombre: string | null;
    creado_en: string;
  }[];

  const grupos: GrupoAdmin[] = ((gruposRes.data ?? []) as { id: string; nombre: string; descripcion: string | null; archivado: boolean }[]).map(
    (g) => ({
      id: g.id,
      nombre: g.nombre,
      descripcion: g.descripcion,
      archivado: g.archivado,
      miembros: miembros.filter((m) => m.grupo_id === g.id).map((m) => m.perfil_id),
      historial: eventos
        .filter((e) => e.grupo_id === g.id)
        .map((e) => ({ id: e.id, tipo: e.tipo, detalle: e.detalle ?? {}, actorNombre: e.actor_nombre, creadoEn: e.creado_en })),
    }),
  );
  const usuarios = ((usuariosRes.data ?? []) as { id: string; email: string; nombre?: string | null }[]).map((u) => ({
    id: u.id,
    nombre: u.nombre || u.email,
  }));

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 p-4 sm:p-6">
      <div className="mb-4 flex items-center gap-3 text-sm">
        <Link href="/configuracion" className="flex min-h-11 items-center text-slate-600">
          ← Configuración
        </Link>
        <h1 className="flex-1 text-center text-base font-bold text-slate-900">Grupos</h1>
        <span className="w-24" />
      </div>
      {error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          No se pudieron cargar los grupos: {/grupos|does not exist|schema cache/i.test(error) ? "falta correr la migración 53 en la base." : error}
        </p>
      ) : (
        <GruposAdmin gruposIniciales={grupos} usuarios={usuarios} />
      )}
    </div>
  );
}
