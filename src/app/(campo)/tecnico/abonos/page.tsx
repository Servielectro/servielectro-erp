import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requierePermiso } from "@/lib/permisos";
import { PantallaPerfil } from "@/components/rrhh/PantallaPerfil";
import { COLUMNAS_ABONO, type Abono } from "@/lib/rrhh-registros";
import { AbonosTecnico } from "./AbonosTecnico";

// Abonos (adelantos) de nómina (migración 64). El técnico pide; Jhojan aprueba y sube el
// pantallazo de la transferencia; RRHH lo descuenta en la quincena del desembolso.
export default async function AbonosPage() {
  await requierePermiso("tecnico", "trabajar");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/tecnico/abonos");

  const { data, error } = await supabase
    .from("abonos")
    .select(COLUMNAS_ABONO)
    .eq("persona_id", user.id)
    .order("fecha_solicitud", { ascending: false })
    .limit(60);

  return (
    <PantallaPerfil
      titulo="Abonos de nómina"
      ayuda="Un adelanto de tu sueldo. Lo aprueba Jhojan y se descuenta en la quincena en que te lo transfieran."
    >
      {error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">No se pudieron leer tus abonos: {error.message}</p>
      ) : (
        <AbonosTecnico yo={user.id} abonos={(data ?? []) as Abono[]} />
      )}
    </PantallaPerfil>
  );
}
