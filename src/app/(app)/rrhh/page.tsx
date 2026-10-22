import Link from "next/link";

const SECCIONES = [
  { href: "/rrhh/gastos", icono: "🧾", nombre: "Gastos del personal", ayuda: "Compras en sitio y transportes: asignar proyecto, observar, reembolsos" },
  { href: "/rrhh/permisos", icono: "🗓️", nombre: "Permisos", ayuda: "Solicitudes, aprobación de Jhojan y permisos gozados" },
  { href: "/rrhh/abonos", icono: "💵", nombre: "Abonos de nómina", ayuda: "Adelantos: aprobación, transferencia y quincena del descuento" },
  { href: "/rrhh/documentos", icono: "📄", nombre: "Documentos del personal", ayuda: "Desprendibles, liquidaciones y contratos por persona" },
  { href: "/rrhh/plantillas", icono: "📝", nombre: "Plantillas de documentos", ayuda: "Modelos de contrato laboral, con historial de versiones" },
];

export default function RrhhPage() {
  return (
    <div className="mx-auto w-full max-w-3xl flex-1 p-4 sm:p-6">
      <h1 className="mb-4 text-center text-sm font-bold text-slate-900">RRHH</h1>
      <div className="grid gap-3 sm:grid-cols-2">
        {SECCIONES.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm active:bg-slate-50"
          >
            <span className="text-3xl">{s.icono}</span>
            <div>
              <p className="text-base font-semibold text-slate-900">{s.nombre}</p>
              <p className="text-xs text-slate-600">{s.ayuda}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
