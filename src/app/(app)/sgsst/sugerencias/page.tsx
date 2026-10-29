import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { tienePermiso } from "@/lib/permisos";
import { Sugerencias, type Sugerencia } from "./Sugerencias";

/**
 * "Sugerencias para la aplicación" (migración 111): una libreta, solo texto. Jhojan: "que ahí sea
 * un cuadro de texto que vaya esta persona llenando y listo". Aparte, a propósito, de las
 * observaciones formales de la 104 (tipo, norma, triage).
 */
export default async function SugerenciasPage() {
  const supabase = await createClient();
  const [{ data: auth }, listaRes, escribe] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("sgsst_sugerencias").select("id, texto, creado_por, creado_en, actualizado_en").is("archivada_en", null).order("creado_en", { ascending: false }).limit(500),
    tienePermiso("sgsst", "trabajar"),
  ]);
  const yo = auth.user?.id ?? "";
  const lista = (listaRes.data ?? []) as Omit<Sugerencia, "autor">[];

  // Quién escribió cada una: los perfiles que se dejen leer y, si no, la ficha de personal.
  const autores = [...new Set(lista.map((s) => s.creado_por))];
  const nombres = new Map<string, string>();
  if (autores.length) {
    const [perfilesRes, personalRes] = await Promise.all([
      supabase.from("perfiles").select("id, nombre").in("id", autores),
      supabase.rpc("fn_sst_personal"),
    ]);
    for (const p of (personalRes.data ?? []) as { perfil_id: string | null; nombre: string }[]) if (p.perfil_id) nombres.set(p.perfil_id, p.nombre);
    for (const p of (perfilesRes.data ?? []) as { id: string; nombre: string | null }[]) if (p.nombre) nombres.set(p.id, p.nombre);
  }

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 space-y-3 p-4 sm:p-6">
      <Link href="/sgsst" className="text-sm text-slate-600 underline">
        ← SG-SST
      </Link>
      <h1 className="text-lg font-bold text-slate-900">Sugerencias para la aplicación</h1>
      {listaRes.error ? (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">No se pudieron leer las sugerencias: {listaRes.error.message}</p>
      ) : (
        <Sugerencias
          yo={yo}
          escribe={escribe}
          sugerencias={lista.map((s) => ({ ...s, autor: s.creado_por === yo ? "Tú" : (nombres.get(s.creado_por) ?? "Otra persona") }))}
        />
      )}
    </div>
  );
}
