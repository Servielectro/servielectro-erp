import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCatalogoActivo, type CatalogoItem } from "@/lib/supabase/catalogo";
import { ReclasificarCatalogo } from "./ReclasificarCatalogo";

export default async function CatalogoPage() {
  const supabase = await createClient();

  let catalogo: CatalogoItem[] = [];
  let error: string | null = null;
  try {
    catalogo = await getCatalogoActivo(supabase);
  } catch (err) {
    error = err instanceof Error ? err.message : "Error desconocido";
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
          No se pudo cargar el catálogo ({error}).
        </p>
      </div>
    );
  }

  const sinPrecio = catalogo.filter((i) => i.valorCompraIva === null).length;
  return (
    <>
      <div className="mx-auto w-full max-w-3xl px-4 pt-4 sm:px-6">
        <Link
          href="/comercial/catalogo/precios"
          className="block rounded-lg border border-brand-red/40 bg-white px-4 py-3 text-sm shadow-sm active:bg-slate-50"
        >
          <span className="font-semibold text-slate-900">Cargar precios en lote</span>
          <span className="block text-xs text-slate-600">
            {sinPrecio} ítems sin precio. Filtra por categoría y digita con el teclado.
          </span>
        </Link>
      </div>
      <ReclasificarCatalogo catalogoInicial={catalogo} />
    </>
  );
}
