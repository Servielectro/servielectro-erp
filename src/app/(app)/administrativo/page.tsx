import Link from "next/link";
import { tienePermiso } from "@/lib/permisos";

export default async function AdministrativoPage() {
  const importa = await tienePermiso("administrativo", "trabajar");
  return (
    <div className="mx-auto w-full max-w-3xl flex-1 p-4 sm:p-6 lg:max-w-6xl">
      <h1 className="mb-1 text-center text-sm font-bold text-slate-900">Administrativo</h1>
      <p className="mb-4 text-center text-xs text-slate-600">Quién es cada cliente o proveedor y cómo se le contacta y factura. Los montos van en Financiero.</p>
      <div className="space-y-3 lg:grid lg:grid-cols-3 lg:gap-3 lg:space-y-0">
        <Link href="/administrativo/clientes" className="flex items-center gap-3 rounded-lg border border-slate-300 bg-white p-4 shadow-sm active:bg-slate-50">
          <span className="text-2xl">🏢</span>
          <div>
            <p className="text-sm font-semibold text-slate-900">Clientes</p>
            <p className="text-xs text-slate-600">Ficha con los datos DIAN para facturar, sedes y RUT.</p>
          </div>
        </Link>
        {importa && (
          <Link href="/administrativo/clientes/importar" className="flex items-center gap-3 rounded-lg border border-slate-300 bg-white p-4 shadow-sm active:bg-slate-50">
            <span className="text-2xl">📥</span>
            <div>
              <p className="text-sm font-semibold text-slate-900">Importar clientes de SIIGO</p>
              <p className="text-xs text-slate-600">Sube el Excel, confirma las columnas y revisa antes de importar.</p>
            </div>
          </Link>
        )}
        <Link href="/administrativo/analisis-documentos" className="flex items-center gap-3 rounded-lg border border-slate-300 bg-white p-4 shadow-sm active:bg-slate-50">
          <span className="text-2xl">🔍</span>
          <div>
            <p className="text-sm font-semibold text-slate-900">Análisis de documentos</p>
            <p className="text-xs text-slate-600">Lo que se envió contra lo que se firmó: qué cambió la contraparte.</p>
          </div>
        </Link>
        <div className="flex items-center gap-3 rounded-lg border border-dashed border-slate-300 bg-slate-100 p-4 opacity-70">
          <span className="text-2xl grayscale">🚚</span>
          <div>
            <p className="text-sm font-semibold text-slate-500">Proveedores</p>
            <p className="text-xs text-slate-500">Próximamente: todavía no está construido.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
