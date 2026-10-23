import { createClient } from "@/lib/supabase/server";
import { MarcoRrhh } from "@/components/rrhh/FiltrosRrhh";
import { hoyColombia } from "@/lib/crm";
import { ParametrosLiquidacion, type Parametro, type ValorParametro } from "./ParametrosLiquidacion";

// RRHH → Parámetros de liquidación (migración 65). Los valores de ley de la empresa, con
// vigencia. Ningún valor está escrito en el código: los carga Jhojan con RRHH y contabilidad.
export default async function ParametrosPage() {
  const supabase = await createClient();
  const [{ data: veTodo }, parametros, valores] = await Promise.all([
    supabase.rpc("fn_rrhh_ve_todo"),
    supabase.from("parametros_liquidacion").select("clave, nombre, unidad, grupo, ayuda, orden, activo").order("orden"),
    supabase.from("parametro_valores").select("id, clave, vigente_desde, valor, nota, registrado_en").order("vigente_desde", { ascending: false }).order("registrado_en", { ascending: false }),
  ]);

  if (veTodo !== true) {
    return (
      <MarcoRrhh titulo="Parámetros de liquidación">
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">Ver y cambiar los parámetros requiere RRHH en nivel “trabajar”.</p>
      </MarcoRrhh>
    );
  }
  if (parametros.error) {
    return (
      <MarcoRrhh titulo="Parámetros de liquidación">
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {/parametros_liquidacion/.test(parametros.error.message) ? "Falta correr la migración 65 en la base." : parametros.error.message}
        </p>
      </MarcoRrhh>
    );
  }

  return (
    <MarcoRrhh
      titulo="Parámetros de liquidación"
      ayuda="Valores de ley de la empresa. Cada cambio se registra con la fecha desde la que rige; el anterior queda en el historial. La ficha de cada persona los hereda."
    >
      <ParametrosLiquidacion
        parametros={(parametros.data ?? []) as Parametro[]}
        valores={(valores.data ?? []) as ValorParametro[]}
        hoy={hoyColombia()}
      />
    </MarcoRrhh>
  );
}
