"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Filtro por persona ("todos" o uno) y, opcional, por estado. Va en la URL para que el
 * filtro sobreviva a recargar y se pueda compartir el enlace.
 */
export function FiltrosRrhh({
  personas,
  estados,
}: {
  personas: { id: string; nombre: string }[];
  estados?: { id: string; nombre: string }[];
}) {
  const router = useRouter();
  const ruta = usePathname();
  const params = useSearchParams();
  const ir = (clave: string, valor: string) => {
    const p = new URLSearchParams(params.toString());
    if (valor) p.set(clave, valor);
    else p.delete(clave);
    router.push(`${ruta}?${p.toString()}`);
  };
  return (
    <div className={`mb-3 grid gap-2 ${estados ? "grid-cols-2" : "grid-cols-1"}`}>
      <label className="text-xs text-slate-600">
        Persona
        <select
          value={params.get("persona") ?? ""}
          onChange={(e) => ir("persona", e.target.value)}
          className="mt-0.5 block w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm"
        >
          <option value="">Todos</option>
          {personas.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </select>
      </label>
      {estados && (
        <label className="text-xs text-slate-600">
          Mostrar
          <select
            value={params.get("estado") ?? estados[0]?.id ?? ""}
            onChange={(e) => ir("estado", e.target.value)}
            className="mt-0.5 block w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm"
          >
            {estados.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nombre}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}

/** Marco común de las pantallas de RRHH. */
export function MarcoRrhh({ titulo, ayuda, children }: { titulo: string; ayuda?: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-3xl flex-1 p-4 sm:p-6 lg:max-w-5xl">
      <a href="/rrhh" className="mb-1 inline-flex min-h-9 items-center text-xs font-semibold text-slate-600">
        ← RRHH
      </a>
      <h1 className="text-center text-sm font-bold text-slate-900">{titulo}</h1>
      {ayuda && <p className="mb-3 text-center text-xs text-slate-600">{ayuda}</p>}
      {children}
    </div>
  );
}
