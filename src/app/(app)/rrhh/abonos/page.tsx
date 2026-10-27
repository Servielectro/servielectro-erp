import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAccesoRrhh } from "@/lib/supabase/rrhh-acceso";
import { FiltrosRrhh, MarcoRrhh } from "@/components/rrhh/FiltrosRrhh";
import { COLUMNAS_ABONO, pesos, type Abono } from "@/lib/rrhh-registros";
import { hoyColombia } from "@/lib/crm";
import { COLUMNAS_CORRECCION, correccionesPorRegistro, type Correccion } from "@/lib/correcciones";
import { AbonosRrhh } from "./AbonosRrhh";

const FILTROS = [
  { id: "abiertos", nombre: "Por decidir o por transferir" },
  { id: "desembolsado", nombre: "Desembolsados (para descontar)" },
  { id: "todos", nombre: "Todos" },
];

// Abonos de nómina de todo el personal. Jhojan aprueba y registra el desembolso con el
// pantallazo (evidencia: después no se cambia). RRHH ve en qué quincena se descuenta.
export default async function AbonosRrhhPage({ searchParams }: { searchParams: Promise<{ persona?: string; estado?: string }> }) {
  const { persona, estado } = await searchParams;
  const filtro = FILTROS.find((f) => f.id === estado)?.id ?? "abiertos";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/rrhh/abonos");
  const acceso = await getAccesoRrhh(supabase, user.id);

  if (!acceso.veTodo && !acceso.apruebaAbonos) {
    return (
      <MarcoRrhh titulo="Abonos de nómina">
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Ver los abonos de todos requiere RRHH en nivel “trabajar” o ser aprobador.
        </p>
      </MarcoRrhh>
    );
  }

  let q = supabase.from("abonos").select(COLUMNAS_ABONO).order("fecha_solicitud", { ascending: false }).limit(300);
  if (persona) q = q.eq("persona_id", persona);
  if (filtro === "abiertos") q = q.in("estado", ["solicitado", "aprobado"]);
  if (filtro === "desembolsado") q = q.eq("estado", "desembolsado");
  const { data, error } = await q;
  const abonos = (data ?? []) as Abono[];
  // Migración 84: las correcciones de los desembolsados (el antes no se pierde).
  const desembolsados = abonos.filter((a) => a.estado === "desembolsado").map((a) => a.id);
  const { data: corr } = desembolsados.length
    ? await supabase.from("correcciones").select(COLUMNAS_CORRECCION).eq("tabla", "abonos").in("registro_id", desembolsados)
    : { data: [] };
  // Lo que se descuenta es lo APROBADO (migración 72); lo pendiente de decidir va aparte, por lo solicitado.
  const aprobado = abonos.filter((a) => a.estado === "aprobado" || a.estado === "desembolsado").reduce((s, a) => s + Number(a.monto_aprobado ?? a.monto), 0);
  const porDecidir = abonos.filter((a) => a.estado === "solicitado").reduce((s, a) => s + Number(a.monto), 0);

  return (
    <MarcoRrhh
      titulo="Abonos de nómina"
      ayuda={acceso.apruebaAbonos ? "Apruebas y registras la transferencia con su pantallazo." : "Los aprueba Jhojan. Se descuentan en la quincena del desembolso."}
    >
      <FiltrosRrhh personas={acceso.personas} estados={FILTROS} />
      {error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">No se pudieron leer los abonos: {error.message}</p>
      ) : (
        <>
          <p className="mb-2 text-xs text-slate-600">
            {abonos.length} {abonos.length === 1 ? "abono" : "abonos"} · aprobado {pesos(aprobado)}
            {porDecidir > 0 && <> · por decidir {pesos(porDecidir)} (lo solicitado)</>}
          </p>
          <AbonosRrhh
            abonos={abonos}
            personas={Object.fromEntries(acceso.personas.map((p) => [p.id, p.nombre]))}
            yo={user.id}
            hoy={hoyColombia()}
            aprueba={acceso.apruebaAbonos}
            correcciones={correccionesPorRegistro((corr ?? []) as Correccion[])}
          />
        </>
      )}
    </MarcoRrhh>
  );
}
