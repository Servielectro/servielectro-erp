import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { logout } from "./logout/actions";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-slate-50 p-8">
      <div className="w-full max-w-md space-y-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-lg font-semibold text-slate-900">
          Servielectro ERP — Módulo Proyectos
        </h1>
        <p className="text-sm text-slate-500">
          Sesión iniciada como <span className="font-medium">{user.email}</span>
        </p>

        <Link
          href="/cotizaciones/nueva"
          className="block rounded-md bg-slate-900 px-4 py-3 text-center text-base font-medium text-white"
        >
          + Nueva cotización
        </Link>

        <Link
          href="/cotizaciones"
          className="block rounded-md border border-slate-300 px-4 py-3 text-center text-base font-medium text-slate-700"
        >
          Ver cotizaciones
        </Link>

        <Link
          href="/catalogo"
          className="block rounded-md border border-slate-300 px-4 py-3 text-center text-base font-medium text-slate-700"
        >
          Catálogo de ítems
        </Link>

        <form action={logout}>
          <button
            type="submit"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700"
          >
            Cerrar sesión
          </button>
        </form>
      </div>
    </div>
  );
}
