"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { MenuPrincipal, type AccesosMenu } from "@/components/MenuPrincipal";

/**
 * Barra superior global — presente en todas las pantallas de la app (menos /login).
 * Logo a la izquierda (vuelve al inicio), menú ☰ a la derecha con acceso a los
 * módulos, cotizaciones/catálogo y la sección de Base de datos.
 */
export function AppHeader({ accesos }: { accesos: AccesosMenu }) {
  const [menuAbierto, setMenuAbierto] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-2 p-3 sm:p-4">
          <Link href="/" className="shrink-0">
            <Image
              src="/logo-servielectro.png"
              alt="Servielectro SAS"
              width={120}
              height={30}
              className="h-6 w-auto sm:h-7"
              priority
            />
          </Link>
          <span className="flex-1" />
          <button
            type="button"
            onClick={() => setMenuAbierto(true)}
            aria-label="Menú"
            className="shrink-0 rounded-md p-1.5 text-slate-700"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              className="h-5 w-5"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5"
              />
            </svg>
          </button>
        </div>
      </header>

      {menuAbierto && <MenuPrincipal onCerrar={() => setMenuAbierto(false)} accesos={accesos} />}
    </>
  );
}
