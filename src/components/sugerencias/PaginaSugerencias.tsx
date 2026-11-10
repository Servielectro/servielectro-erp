import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { tienePermiso } from "@/lib/permisos";
import { SugerenciasModulo, type Sugerencia } from "./SugerenciasModulo";

/**
 * «Sugerencias para la aplicación» de un módulo (tabla modulo_sugerencias). La misma pantalla en
 * /rrhh, /contable y /sgsst. Ver: permiso del módulo; escribir y corregir lo propio: «trabajar».
 * La base lo exige con fn_tiene_permiso(modulo, …); aquí solo se refleja.
 *
 * Ojo: /operativo/sugerencias NO es esto. Es la bandeja de los materiales que sugieren los
 * técnicos en la visita (visita_sugerencias), que el comercial cotiza o descarta.
 */
export async function PaginaSugerencias({ modulo, nombreModulo, volverA }: { modulo: string; nombreModulo: string; volverA: string }) {
  const supabase = await createClient();
  const [{ data: auth }, listaRes, escribe] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from("modulo_sugerencias")
      .select("id, texto, creado_por, creado_en, actualizado_en, archivada_en")
      .eq("modulo", modulo)
      .order("creado_en", { ascending: false })
      .limit(500),
    tienePermiso(modulo, "trabajar"),
  ]);
  const yo = auth.user?.id ?? "";
  const lista = (listaRes.data ?? []) as Omit<Sugerencia, "autor">[];

  // Quién escribió cada una. perfiles deja leer el propio y, a quien es responsable de
  // Configuración (Jhojan), todos: él ve el nombre de cada quien. Sin eso, se dice que es otra persona.
  const autores = [...new Set(lista.map((s) => s.creado_por))].filter((a) => a !== yo);
  const nombres = new Map<string, string>();
  if (autores.length) {
    const { data } = await supabase.from("perfiles").select("id, nombre").in("id", autores);
    for (const p of (data ?? []) as { id: string; nombre: string | null }[]) if (p.nombre) nombres.set(p.id, p.nombre);
  }

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 space-y-3 p-4 sm:p-6">
      <Link href={volverA} className="text-sm text-slate-600 underline">
        ← {nombreModulo}
      </Link>
      <h1 className="text-lg font-bold text-slate-900">Sugerencias para la aplicación</h1>
      <p className="text-sm text-slate-600">Lo que mejorarías de {nombreModulo} en la aplicación: lo lee Jhojan.</p>
      {listaRes.error ? (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">No se pudieron leer las sugerencias: {listaRes.error.message}</p>
      ) : (
        <SugerenciasModulo
          modulo={modulo}
          nombreModulo={nombreModulo}
          yo={yo}
          escribe={escribe}
          sugerencias={lista.map((s) => ({ ...s, autor: s.creado_por === yo ? "Tú" : (nombres.get(s.creado_por) ?? "Otra persona del módulo") }))}
        />
      )}
    </div>
  );
}
