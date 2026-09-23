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
        <p className="text-sm text-slate-500">
          Todavía no hay pantallas de cotización ni proyectos: primero se
          valida el modelo de datos y las decisiones abiertas.
        </p>
        <form action={logout}>
          <button
            type="submit"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700"
          >
            Cerrar sesión
          </button>
        </form>
      </div>
    </div>
  );
}
