import Link from "next/link";
import { tienePermiso } from "@/lib/permisos";
import { TiempoInactividad } from "./TiempoInactividad";

export default async function ConfiguracionPage() {
  // Grupos y transferir: solo configuracion/responsable (sus páginas lo exigen igual).
  const responsable = await tienePermiso("configuracion", "responsable");
  return (
    <div className="mx-auto w-full max-w-3xl flex-1 p-4 sm:p-6">
      <h1 className="mb-4 text-center text-sm font-bold text-slate-900">
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

        <Link
          href="/configuracion/consecutivo"
          className="flex items-center gap-3 rounded-lg border border-slate-300 bg-white p-4 shadow-sm active:bg-slate-50"
        >
          <span className="text-2xl">🔢</span>
          <div>
            <p className="text-sm font-semibold text-slate-900">
              Consecutivo de cotizaciones
            </p>
            <p className="text-xs text-slate-600">
              Último número usado y próximo a emitir, por año, con historial de cambios.
            </p>
          </div>
        </Link>

        {responsable && (
          <>
            <Link
              href="/configuracion/grupos"
              className="flex items-center gap-3 rounded-lg border border-slate-300 bg-white p-4 shadow-sm active:bg-slate-50"
            >
              <span className="text-2xl">👥</span>
              <div>
                <p className="text-sm font-semibold text-slate-900">Grupos</p>
                <p className="text-xs text-slate-600">
                  Para compartir tareas y eventos de Planificación con varias personas a la vez.
                </p>
              </div>
            </Link>
            <Link
              href="/configuracion/transferir"
              className="flex items-center gap-3 rounded-lg border border-slate-300 bg-white p-4 shadow-sm active:bg-slate-50"
            >
              <span className="text-2xl">🔁</span>
              <div>
                <p className="text-sm font-semibold text-slate-900">Transferir tareas</p>
                <p className="text-xs text-slate-600">
                  Cuando alguien se va: sus tareas pendientes pasan a otra persona, con motivo y rastro.
                </p>
              </div>
            </Link>
          </>
        )}

        <TiempoInactividad />
      </div>
    </div>
  );
}
