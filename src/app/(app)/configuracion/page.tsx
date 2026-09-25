import Link from "next/link";
import { TiempoInactividad } from "./TiempoInactividad";

export default function ConfiguracionPage() {
  return (
    <div className="mx-auto w-full max-w-3xl flex-1 p-4 sm:p-6">
      <h1 className="mb-4 text-center text-sm font-bold text-slate-900 sm:text-base">
        Configuración
      </h1>

      <div className="space-y-3">
        <Link
          href="/configuracion/usuarios"
          className="flex items-center gap-3 rounded-lg border border-slate-300 bg-white p-4 shadow-sm active:bg-slate-50"
        >
          <span className="text-2xl">🔐</span>
          <div>
            <p className="text-sm font-semibold text-slate-900">
              Usuarios y permisos
            </p>
            <p className="text-xs text-slate-600">
              Quién puede ver qué — importante antes de sumar un segundo usuario.
            </p>
          </div>
        </Link>

        <TiempoInactividad />
      </div>
    </div>
  );
}
