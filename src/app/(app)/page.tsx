import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { logout } from "@/app/logout/actions";
import { getMisPermisos } from "@/lib/permisos";

const MODULOS = [
  { id: "comercial", nombre: "Comercial", icono: "💼", href: "/comercial", activo: true },
  { id: "configuracion", nombre: "Configuración", icono: "🔐", href: "/configuracion", activo: true },
  { id: "licitaciones", nombre: "Licitaciones", icono: "📑", href: "/licitaciones", activo: true },
  { id: "financiero", nombre: "Financiero", icono: "💰", activo: false },
  { id: "contable", nombre: "Contable", icono: "📊", activo: false },
  { id: "marketing", nombre: "Marketing", icono: "📣", activo: false },
  { id: "administrativo", nombre: "Administrativo", icono: "🗂️", activo: false },
  { id: "rrhh", nombre: "RRHH", icono: "👥", href: "/rrhh", activo: true },
  { id: "tecnico", nombre: "Técnico", icono: "🔧", href: "/tecnico", activo: true },
  { id: "operativo", nombre: "Operativo", icono: "⚙️", href: "/operativo", activo: true },
] as const;

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Solo los módulos con permiso (fn_mis_permisos). Las rutas se protegen aparte, en el servidor.
  const permisos = await getMisPermisos();
  // Técnico exige tecnico/trabajar (su pantalla lo pide): con solo "consultar" la tarjeta
  // llevaría a una pantalla que lo devuelve al inicio.
  const visibles = MODULOS.filter(
    (m) => permisos[m.id] && (m.id !== "tecnico" || permisos.tecnico.nivel !== "consultar"),
  );

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 p-4 sm:p-6">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-slate-600">
          Sesión iniciada como <span className="font-medium">{user?.email}</span>
        </p>
        <form action={logout}>
          <button
            type="submit"
            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700"
          >
            Cerrar sesión
          </button>
        </form>
      </div>

      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        Módulos
      </h2>
      {visibles.length === 0 && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Tu usuario todavía no tiene módulos asignados. Pídele al administrador que te
          asigne un rol en Configuración → Usuarios y permisos.
        </p>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {visibles.map((m) =>
          m.activo ? (
            <Link
              key={m.nombre}
              href={m.href}
              className="flex flex-col items-center gap-2 rounded-lg border border-slate-200 bg-white p-4 text-center shadow-sm active:bg-slate-50"
            >
              <span className="text-2xl">{m.icono}</span>
              <span className="text-sm font-medium text-slate-900">
                {m.nombre}
              </span>
            </Link>
          ) : (
            <div
              key={m.nombre}
              className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-slate-200 bg-slate-100 p-4 text-center opacity-60"
            >
              <span className="text-2xl grayscale">{m.icono}</span>
              <span className="text-sm font-medium text-slate-500">
                {m.nombre}
              </span>
              <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                Próximamente
              </span>
            </div>
          ),
        )}
      </div>
    </div>
  );
}
