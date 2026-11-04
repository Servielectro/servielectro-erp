"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const PESTANAS = [
  { href: "/cliente/proyectos", nombre: "Proyectos" },
  { href: "/cliente/documentos", nombre: "Documentos" },
  { href: "/cliente/personal", nombre: "Personal" },
  { href: "/cliente/firmas", nombre: "Por firmar" },
];

/** Las cuatro secciones del portal, a un toque en el celular (sin abrir la hamburguesa). */
export function PestanasPortal({ ocultas }: { ocultas: string[] }) {
  const ruta = usePathname();
  const visibles = PESTANAS.filter((p) => !ocultas.includes(p.href));
  return (
    <nav className="-mx-4 mb-3 flex gap-1 overflow-x-auto border-b border-slate-200 px-4" aria-label="Portal del cliente">
      {visibles.map((p) => {
        const activa = ruta === p.href || ruta.startsWith(`${p.href}/`);
        return (
          <Link
            key={p.href}
            href={p.href}
            aria-current={activa ? "page" : undefined}
            className={`flex min-h-11 shrink-0 items-center border-b-2 px-3 text-sm font-semibold ${
              activa ? "border-slate-900 text-slate-900" : "border-transparent text-slate-500"
            }`}
          >
            {p.nombre}
          </Link>
        );
      })}
    </nav>
  );
}
