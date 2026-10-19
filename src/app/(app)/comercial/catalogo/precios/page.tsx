import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCatalogoActivo } from "@/lib/supabase/catalogo";
import { CargaPrecios } from "./CargaPrecios";

export default async function CargaPreciosPage() {
  const supabase = await createClient();
  const catalogo = await getCatalogoActivo(supabase);

  return (
    <div className="mx-auto w-full max-w-4xl flex-1 p-4 sm:p-6">
      <Link href="/comercial/catalogo" className="mb-2 inline-block text-sm text-slate-600">
        ← Catálogo
      </Link>
      <h1 className="mb-1 text-center text-sm font-bold text-slate-900">
        Cargar precios de compra
      </h1>
      <p className="mb-4 text-center text-xs text-slate-500">
        Precio de compra con IVA. Enter pasa al siguiente ítem. Nada se guarda hasta tocar
        &quot;Guardar&quot;.
      </p>
      <CargaPrecios catalogo={catalogo} />
    </div>
  );
}
