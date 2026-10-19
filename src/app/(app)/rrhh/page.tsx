import Link from "next/link";

export default function RrhhPage() {
  return (
    <div className="mx-auto w-full max-w-3xl flex-1 p-4 sm:p-6">
      <h1 className="mb-4 text-center text-sm font-bold text-slate-900">RRHH</h1>
      <div className="grid gap-3 sm:grid-cols-2">
        <Link
          href="/rrhh/plantillas"
          className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm active:bg-slate-50"
        >
          <span className="text-3xl">📄</span>
          <div>
            <p className="text-base font-semibold text-slate-900">Plantillas de documentos</p>
            <p className="text-xs text-slate-600">Modelos de contrato laboral, con historial de versiones</p>
          </div>
        </Link>
      </div>
    </div>
  );
}
