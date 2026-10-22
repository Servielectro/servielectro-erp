import Link from "next/link";

/** Marco de las pantallas del perfil del técnico (/tecnico/…): volver, título y ayuda. */
export function PantallaPerfil({
  titulo,
  ayuda,
  children,
}: {
  titulo: string;
  ayuda?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-xl px-4 pb-24 pt-2">
      <Link href="/tecnico" className="flex min-h-11 items-center text-sm text-slate-600">
        ← Mis visitas
      </Link>
      <h1 className="text-xl font-bold text-slate-900">{titulo}</h1>
      {ayuda && <p className="mb-3 text-sm text-slate-600">{ayuda}</p>}
      {children}
    </div>
  );
}

export const CAMPO = "mt-0.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base";
export const ETIQUETA = "text-sm text-slate-600";
export const TARJETA = "rounded-xl border border-slate-300 bg-white p-3";
