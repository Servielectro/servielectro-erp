import Image from "next/image";
import Link from "next/link";
import { EMPRESA } from "./empresa";

// Layout de las únicas dos páginas públicas del ERP (/inicio y /privacidad). Están fuera de
// (app) a propósito: no leen sesión, permisos ni nada de la base. Lo que las deja pasar sin
// login es la lista literal RUTAS_PUBLICAS de src/proxy.ts.
export default function PublicoLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-800">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3">
          <Link href="/inicio" aria-label="Servielectro ERP — inicio">
            <Image src="/logo-servielectro.png" alt="Servielectro S.A.S." width={220} height={55} className="h-auto w-36" priority />
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/privacidad" className="text-slate-600 hover:text-slate-900">Privacidad</Link>
            <Link href="/login" className="rounded-md bg-brand-red px-3 py-1.5 font-medium text-white hover:bg-brand-red-dark">Ingresar</Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">{children}</main>
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-3xl space-y-1 px-4 py-4 text-xs text-slate-500">
          <p>{EMPRESA.razonSocial} ({EMPRESA.marca}) · NIT {EMPRESA.nit}</p>
          <p>{EMPRESA.direccion}, {EMPRESA.ciudad} · {EMPRESA.correo} · {EMPRESA.telefono}</p>
          <p>
            <Link href="/inicio" className="underline">Inicio</Link> ·{" "}
            <Link href="/privacidad" className="underline">Política de tratamiento de datos y privacidad</Link>
          </p>
        </div>
      </footer>
    </div>
  );
}
