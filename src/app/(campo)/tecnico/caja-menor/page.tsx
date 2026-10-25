import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requierePermiso } from "@/lib/permisos";
import { PantallaPerfil } from "@/components/rrhh/PantallaPerfil";
import { COLUMNAS_CAJA, COLUMNAS_FOTO_CAJA, COLUMNAS_GASTO_CAJA, type CajaMenor, type FotoCaja, type GastoCaja } from "@/lib/caja-menor";
import { hoyColombia } from "@/lib/crm";
import { CajaMenorTecnico } from "./CajaMenorTecnico";

// Caja menor del técnico (migración 69): viáticos para obra fuera de la ciudad. Solo SUS cajas
// (fn_mis_cajas_menores: su ficha enlazada), aunque quien abra tenga RRHH y la RLS le muestre todas.
export default async function CajaMenorTecnicoPage() {
  await requierePermiso("tecnico", "trabajar");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/tecnico/caja-menor");

  const { data: mias } = await supabase.rpc("fn_mis_cajas_menores");
  const ids = ((mias ?? []) as string[]).filter(Boolean);
  const cajas = ids.length
    ? (((
        await supabase.from("v_caja_menor_recibos").select(COLUMNAS_CAJA).in("id", ids).eq("estado", "abierta").is("anulado_en", null).order("fecha_entrega", { ascending: false })
      ).data ?? []) as CajaMenor[])
    : [];
  const idsAbiertas = cajas.map((c) => c.id);
  const [gastos, fotos] = idsAbiertas.length
    ? await Promise.all([
        supabase.from("caja_menor_lineas").select(COLUMNAS_GASTO_CAJA).in("recibo_id", idsAbiertas).order("registrado_en", { ascending: false }),
        supabase.from("caja_menor_soportes").select(COLUMNAS_FOTO_CAJA).in("recibo_id", idsAbiertas),
      ])
    : [{ data: [] }, { data: [] }];

  return (
    <PantallaPerfil titulo="Caja menor" ayuda="Viáticos de la obra fuera de la ciudad. Registra cada gasto con la foto de la factura: RRHH lo ve al instante.">
      {cajas.length === 0 ? (
        <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">
          No tienes una caja menor abierta. Cuando RRHH te asigne viáticos para una obra, aparece acá.
        </p>
      ) : (
        <CajaMenorTecnico cajas={cajas} gastos={(gastos.data ?? []) as GastoCaja[]} fotos={(fotos.data ?? []) as FotoCaja[]} hoy={hoyColombia()} />
      )}
    </PantallaPerfil>
  );
}
