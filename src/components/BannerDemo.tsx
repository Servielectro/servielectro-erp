import { createClient } from "@/lib/supabase/server";
import { esDemo } from "@/lib/demo";

/**
 * Aviso permanente para el usuario de demostración (migración 116): que no haya forma de confundir
 * esto con el ERP de verdad. Va arriba de todo, en todas las pantallas (oficina y campo).
 */
export async function BannerDemo() {
  if (!(await esDemo(await createClient()))) return null;
  return (
    <div role="status" className="border-b-2 border-amber-400 bg-amber-100 px-4 py-2 text-center text-sm text-amber-950 print:hidden">
      <b>MODO DEMOSTRACIÓN.</b> Los datos y precios son de prueba. Lo que crees se borra solo a las 5 horas. Puedes cambiar o borrar
      solo lo que tú creas: lo de la empresa se ve, pero no se toca.
    </div>
  );
}
