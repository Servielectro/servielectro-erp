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

  return <ReclasificarCatalogo catalogoInicial={catalogo} />;
}
