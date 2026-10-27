import { textoCorreccion, type Correccion } from "@/lib/correcciones";

/** El historial de correcciones de un registro cerrado: el antes nunca se pierde. */
export function CorreccionesRegistro({ lista, grande }: { lista: Correccion[] | undefined; grande?: boolean }) {
  if (!lista?.length) return null;
  return (
    <ul className={`mt-1 space-y-1 ${grande ? "text-sm" : "text-xs"}`}>
      {lista.map((c) => (
        <li key={c.id} className="rounded-md border border-sky-200 bg-sky-50 px-2 py-1 text-sky-900">
          ✎ {textoCorreccion(c)}
        </li>
      ))}
    </ul>
  );
}
