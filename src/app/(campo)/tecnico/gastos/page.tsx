import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requierePermiso } from "@/lib/permisos";
import { PantallaPerfil } from "@/components/rrhh/PantallaPerfil";
import { COLUMNAS_GASTO, type Gasto } from "@/lib/rrhh-registros";
import { hoyColombia } from "@/lib/crm";
import { GastosTecnico } from "./GastosTecnico";

// Compras de material en sitio y transportes adicionales (migración 64). Cada técnico ve solo
// los suyos: lo exige la RLS, y además se filtra por su id (alguien de RRHH que abra esta
// pantalla ve sus propios gastos, no los de todos).
export default async function GastosPage() {
  await requierePermiso("tecnico", "trabajar");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/tecnico/gastos");

  // Historial de caja menor: cuando ya no tiene ninguna abierta, el módulo no sale en su perfil;
  // las cerradas se consultan desde acá.
  const { data: misCajas } = await supabase.rpc("fn_mis_cajas_menores");
  const idsCajas = ((misCajas ?? []) as string[]).filter(Boolean);
  const cerradas = idsCajas.length
    ? ((await supabase.from("v_caja_menor_recibos").select("id", { count: "exact", head: true }).in("id", idsCajas).eq("estado", "cerrada").is("anulado_en", null)).count ?? 0)
    : 0;

  const [gastosRes, proyectosRes] = await Promise.all([
    supabase.from("gastos").select(COLUMNAS_GASTO).eq("persona_id", user.id).order("fecha", { ascending: false }).limit(100),
    supabase.rpc("fn_proyectos_del_tecnico"),
  ]);

  return (
    <PantallaPerfil
      titulo="Mis gastos"
      ayuda="Compras de material en la ciudad y transportes por encima del auxilio. Con la foto de la factura, RRHH no tiene que preguntarte nada."
    >
      {cerradas > 0 && (
        <a href="/tecnico/caja-menor" className="mb-3 flex min-h-11 items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold">
          🧳 Historial de caja menor (viáticos): {cerradas} {cerradas === 1 ? "caja cerrada" : "cajas cerradas"} →
        </a>
      )}
      {gastosRes.error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">No se pudieron leer tus gastos: {gastosRes.error.message}</p>
      ) : (
        <GastosTecnico
          yo={user.id}
          hoy={hoyColombia()}
          gastos={(gastosRes.data ?? []) as unknown as Gasto[]}
          proyectos={(proyectosRes.data ?? []) as { id: string; codigo: string; nombre: string }[]}
        />
      )}
    </PantallaPerfil>
  );
}
