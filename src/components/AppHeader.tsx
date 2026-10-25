"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MenuPrincipal, type AccesosMenu } from "@/components/MenuPrincipal";
import { seccionesMenu } from "@/lib/menu";
import { logout } from "@/app/logout/actions";
import { BotonBuscador } from "@/components/BuscadorSecciones";

/**
 * Barra superior global — presente en todas las pantallas de la app (menos /login).
 *
 * Por ANCHO de pantalla, con el escalón de computador de globals.css (≥1024 px), no por
 * orientación: la tablet en horizontal (~1280 px) cae del lado ancho y en vertical (~800 px)
 * del angosto, que es lo que pidió Jhojan, y además el computador hereda la barra y un
 * celular girado (~850 px de ancho, muy bajito) no se queda con una barra que le come la
 * pantalla.
 *   - Angosto: logo a la izquierda y ☰ a la derecha (como siempre).
 *   - Ancho: barra tipo página web — logo, los módulos habilitados con sus submódulos, y a la
 *     derecha el usuario y "Cerrar sesión". Sin hamburguesa.
 * Las dos salen de la misma lista (src/lib/menu.ts): solo los módulos que el usuario tiene.
 *
 * Mide 57 px (65 px desde sm) en los dos modos: la app del técnico se pega debajo con esos altos.
 */
export function AppHeader({ accesos, usuario }: { accesos: AccesosMenu; usuario?: string | null }) {
  const [menuAbierto, setMenuAbierto] = useState<false | "menu" | "basedatos">(false);
  const ruta = usePathname();
  // La lista abierta recuerda en qué pantalla se abrió: al navegar, queda cerrada sola.
  const [abiertaEn, setAbiertaEn] = useState<{ id: string; ruta: string } | null>(null);
  const desplegada = abiertaEn?.ruta === ruta ? abiertaEn.id : null;
  const setDesplegada = (f: (d: string | null) => string | null) => setAbiertaEn({ id: f(desplegada) ?? "", ruta });
  const barra = useRef<HTMLElement>(null);
  const secciones = seccionesMenu(accesos);

  // Una lista abierta se cierra al tocar fuera o con Escape.
  useEffect(() => {
    if (!desplegada) return;
    const fuera = (e: PointerEvent) => {
      if (barra.current && !barra.current.contains(e.target as Node)) setAbiertaEn(null);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAbiertaEn(null);
    document.addEventListener("pointerdown", fuera);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", fuera);
      document.removeEventListener("keydown", esc);
    };
  }, [desplegada]);

  const activa = (href: string) => ruta === href || ruta.startsWith(href + "/");

  return (
    <>
      <header ref={barra} className="sticky top-0 z-30 border-b print:hidden border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-2 px-3 py-1.5 sm:px-4 sm:py-2.5 lg:max-w-none lg:px-6">
          <Link href="/" className="flex min-h-11 items-center shrink-0">
            <Image src="/logo-servielectro.png" alt="Servielectro SAS" width={120} height={30} className="h-6 w-auto sm:h-7" priority />
          </Link>
          {/* Buscador de secciones: junto al logo, en los dos modos (con el dedo, Ctrl+K o /). */}
          <BotonBuscador secciones={secciones} />

          {/* Pantalla ancha: los módulos en la barra. */}
          <nav className="ml-4 hidden min-w-0 flex-1 items-center gap-0.5 lg:flex" aria-label="Módulos">
            {secciones.map((s) =>
              s.hijos.length === 0 ? (
                <Link
                  key={s.id}
                  href={s.href}
                  className={`flex min-h-11 items-center whitespace-nowrap rounded-md px-2.5 text-sm font-medium hover:bg-slate-100 ${
                    activa(s.href) ? "bg-slate-100 text-slate-900" : "text-slate-600"
                  }`}
                >
                  {s.nombre}
                </Link>
              ) : (
                <div key={s.id} className="relative">
                  <button
                    type="button"
                    aria-expanded={desplegada === s.id}
                    onClick={() => setDesplegada((d) => (d === s.id ? null : s.id))}
                    className={`flex min-h-11 items-center gap-1 whitespace-nowrap rounded-md px-2.5 text-sm font-medium hover:bg-slate-100 ${
                      activa(s.href) || desplegada === s.id ? "bg-slate-100 text-slate-900" : "text-slate-600"
                    }`}
                  >
                    {s.nombre}
                    <span aria-hidden className="text-xs text-slate-400">
                      ▾
                    </span>
                  </button>
                  {desplegada === s.id && (
                    <div className="absolute left-0 top-full z-40 mt-1 w-64 rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
                      <Link href={s.href} className="flex min-h-11 items-center rounded-md px-3 text-sm font-semibold text-slate-800 hover:bg-slate-50">
                        {s.nombreLargo ?? s.nombre}
                        {s.nota && <span className="ml-1 text-xs font-normal text-amber-700">({s.nota})</span>}
                      </Link>
                      {s.hijos.map((h) => (
                        <Link
                          key={h.href}
                          href={h.href}
                          className={`flex min-h-11 items-center rounded-md text-sm hover:bg-slate-50 ${h.nivel === 2 ? "pl-8 text-slate-500" : "pl-5 text-slate-600"} ${
                            activa(h.href) ? "font-semibold text-slate-900" : ""
                          }`}
                        >
                          {h.nombre}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              ),
            )}
          </nav>

          <span className="flex-1 lg:hidden" />

          {/* Pantalla ancha: lo del usuario a la derecha. */}
          <div className="hidden shrink-0 items-center gap-1 lg:flex">
            {accesos.baseDatos && (
              <button
                type="button"
                onClick={() => setMenuAbierto("basedatos")}
                className="flex min-h-11 items-center whitespace-nowrap rounded-md px-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
              >
                Base de datos
              </button>
            )}
            {usuario && (
              <span className="hidden max-w-56 truncate px-2 text-xs text-slate-500 xl:inline" title={usuario}>
                {usuario}
              </span>
            )}
            <form action={logout}>
              <button
                type="submit"
                title={usuario ? `Cerrar la sesión de ${usuario}` : undefined}
                className="flex min-h-11 items-center whitespace-nowrap rounded-md border border-slate-300 px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Cerrar sesión
              </button>
            </form>
          </div>

          {/* Pantalla angosta: la hamburguesa de siempre. */}
          <button
            type="button"
            onClick={() => setMenuAbierto("menu")}
            aria-label="Menú"
            className="inline-flex min-h-11 min-w-11 items-center justify-center shrink-0 rounded-md p-1.5 text-slate-700 lg:hidden"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" />
            </svg>
          </button>
        </div>
      </header>

      {menuAbierto && (
        <MenuPrincipal onCerrar={() => setMenuAbierto(false)} accesos={accesos} abrirEn={menuAbierto === "basedatos" ? "basedatos" : undefined} />
      )}
    </>
  );
}
