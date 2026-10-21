import Link from "next/link";
import { requierePermiso } from "@/lib/permisos";
import { LimpiezaArchivos } from "./LimpiezaArchivos";

// Archivos de visitas que ya no existen (fotos y firmas sueltas en el almacenamiento).
export default async function ArchivosPage() {
  await requierePermiso("configuracion", "responsable");
  return (
    <div className="mx-auto w-full max-w-3xl flex-1 space-y-3 p-4 sm:p-6">
      <Link href="/configuracion" className="flex min-h-11 items-center text-sm text-slate-600">
        ← Configuración
      </Link>
      <h1 className="text-base font-bold text-slate-900">Archivos sin visita</h1>
      <p className="text-sm text-slate-600">
        Fotos y firmas que quedaron en el almacenamiento de una visita que ya no existe en la base (por ejemplo, datos
        de prueba borrados a mano). Ocupan espacio del plan y nadie las puede ver. Primero se revisa; después se borran,
        y se comprueba que no quedó nada.
      </p>
      <LimpiezaArchivos />
    </div>
  );
}
