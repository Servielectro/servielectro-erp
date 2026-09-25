import Link from "next/link";

export default function UsuariosPage() {
  return (
    <div className="mx-auto w-full max-w-2xl flex-1 p-4 sm:p-6">
      <Link href="/configuracion" className="mb-2 inline-block text-sm text-slate-600">
        ← Configuración
      </Link>
      <h1 className="mb-4 text-center text-sm font-bold text-slate-900 sm:text-base">
        Usuarios y permisos
      </h1>

      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
        <p className="text-sm font-medium text-amber-900">
          Todavía se está construyendo.
        </p>
        <p className="mt-2 text-sm text-amber-800">
          Hoy cualquier usuario que inicie sesión ve todo — costos, márgenes y
          utilidad de todas las obras — porque la base todavía no distingue
          roles. Esta pantalla es donde eso se va a resolver: quién puede ver
          precios de venta nada más, y quién puede ver costos y márgenes.
        </p>
      </div>

      <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
        <p className="mb-2 text-sm font-semibold text-slate-800">
          Cuando esté lista vas a poder:
        </p>
        <ul className="list-disc space-y-1 pl-4 text-sm text-slate-600">
          <li>Ver la lista de usuarios con acceso al sistema.</li>
          <li>
            Asignarle un rol a cada uno (ej. administrador, comercial,
            técnico).
          </li>
          <li>
            Que un rol &quot;comercial&quot; pueda armar cotizaciones sin ver
            el costo de compra ni el margen de cada ítem.
          </li>
        </ul>
      </div>
    </div>
  );
}
