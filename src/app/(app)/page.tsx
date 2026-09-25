import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { logout } from "@/app/logout/actions";

const MODULOS = [
  { nombre: "Comercial", icono: "💼", href: "/comercial", activo: true },
  { nombre: "Configuración", icono: "🔐", href: "/configuracion", activo: true },
  { nombre: "Financiero", icono: "💰", activo: false },
  { nombre: "Contable", icono: "📊", activo: false },
  { nombre: "Marketing", icono: "📣", activo: false },
  { nombre: "Administrativo", icono: "🗂️", activo: false },
  { nombre: "RRHH", icono: "👥", activo: false },
  { nombre: "Técnico", icono: "🔧", activo: false },
  { nombre: "Operativo", icono: "⚙️", activo: false },
] as const;

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

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
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {MODULOS.map((m) =>
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
