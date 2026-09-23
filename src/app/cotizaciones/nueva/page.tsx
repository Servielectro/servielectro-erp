import { createClient } from "@/lib/supabase/server";
import { getCatalogoActivo, type CatalogoItem } from "@/lib/supabase/catalogo";
import { CotizacionBuilder } from "./CotizacionBuilder";

export default async function NuevaCotizacionPage() {
  const supabase = await createClient();

  let catalogo: CatalogoItem[] = [];
  try {
    catalogo = await getCatalogoActivo(supabase);
  } catch (err) {
    // Supabase todavía no está configurado o no responde: se muestra la pantalla
    // igual (sin catálogo) en vez de romper toda la página.
    console.error("No se pudo cargar el catálogo de ítems:", err);
  }

  return <CotizacionBuilder catalogoInicial={catalogo} />;
}
