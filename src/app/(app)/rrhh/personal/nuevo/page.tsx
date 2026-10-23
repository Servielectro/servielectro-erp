import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { MarcoRrhh } from "@/components/rrhh/FiltrosRrhh";
import { getProyectosNombres } from "@/lib/supabase/proyectos";
import { hoyColombia } from "@/lib/crm";
import { FichaNueva, type DatosFichaNueva } from "./FichaNueva";

// Nuevo empleado. Las 8 pestañas se ven y se llenan desde el principio (Jhojan quiere mostrarle
// a RRHH el panel completo); solo guardar en las otras pestañas espera a crear la ficha. Al
// crearla, esta misma pantalla sigue con ?id=… y carga lo de esa ficha, sin perder lo escrito.
export default async function NuevoEmpleadoPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id: idParam } = await searchParams;
  const supabase = await createClient();
  const [{ data: veTodo }, vigentes, personas, enlazados, herramientas, proyectos] = await Promise.all([
    supabase.rpc("fn_rrhh_ve_todo"),
    supabase.rpc("fn_parametros_vigentes"),
    supabase.rpc("fn_personas_rrhh"),
    supabase.from("empleados").select("id, perfil_id").not("perfil_id", "is", null),
    supabase.from("herramientas").select("id, nombre, serial, estado").order("nombre"),
    getProyectosNombres(supabase),
  ]);
  if (veTodo !== true) {
    return (
      <MarcoRrhh titulo="Nuevo empleado">
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">Crear fichas del personal requiere RRHH en nivel “trabajar”.</p>
      </MarcoRrhh>
    );
  }

  // Recién creada: lo que ya tenga esa ficha (al principio, nada; después de guardar en una pestaña, eso).
  const empleado = idParam
    ? ((await supabase.from("empleados").select("id, perfil_id, salario_base").eq("id", idParam).maybeSingle()).data as {
        id: string;
        perfil_id: string | null;
        salario_base: number;
      } | null)
    : null;
  const id = empleado?.id ?? null;
  const vacio = { data: [] as unknown[] };
  const [archivos, entregas, liquidaciones, desprendibles, recibos, contratos] = id
    ? await Promise.all([
        supabase.from("empleado_archivos").select("id, tipo, storage_path, nombre_archivo, subido_en").eq("empleado_id", id).order("subido_en", { ascending: false }),
        supabase.from("dotacion_entregas").select("id, categoria, herramienta_id, nombre, cantidad, talla, fecha_entrega, foto_path, observacion, devuelta_en").eq("empleado_id", id).order("fecha_entrega", { ascending: false }),
        supabase.from("liquidaciones").select("*, liquidacion_lineas(seccion, concepto, cantidad, valor)").eq("empleado_id", id).order("fecha_corte", { ascending: false }),
        supabase.from("desprendibles").select("*").eq("empleado_id", id).order("periodo_fin", { ascending: false }),
        supabase.from("v_caja_menor_recibos").select("id, concepto, proyecto_id, fecha_entrega, total, anulado_en, motivo_anulacion").eq("empleado_id", id).order("fecha_entrega", { ascending: false }),
        supabase.from("contratos_laborales").select("id, tipo, clase, estado, fecha_inicio, fecha_fin").eq("empleado_id", id).order("created_at", { ascending: false }),
      ])
    : [vacio, vacio, vacio, vacio, vacio, vacio];
  const idsRecibos = ((recibos.data ?? []) as { id: string }[]).map((r) => r.id);
  const [lineas, soportes] = idsRecibos.length
    ? await Promise.all([
        supabase.from("caja_menor_lineas").select("recibo_id, concepto, documento_soporte, valor").in("recibo_id", idsRecibos).order("orden"),
        supabase.from("caja_menor_soportes").select("recibo_id, storage_path, nombre_archivo").in("recibo_id", idsRecibos),
      ])
    : [vacio, vacio];

  const auxilio = ((vigentes.data ?? []) as { clave: string; valor: number | null }[]).find((p) => p.clave === "auxilio_transporte")?.valor ?? null;
  const datos: DatosFichaNueva = {
    personas: (personas.data ?? []) as { id: string; nombre: string }[],
    enlazados: ((enlazados.data ?? []) as { id: string; perfil_id: string }[]).filter((x) => x.id !== id).map((x) => x.perfil_id),
    herramientas: (herramientas.data ?? []) as DatosFichaNueva["herramientas"],
    proyectos: (proyectos ?? []).filter((p) => p.estado === "EN_EJECUCION"),
    auxilioEmpresa: auxilio === null ? null : Number(auxilio),
    perfilId: empleado?.perfil_id ?? null,
    archivos: (archivos.data ?? []) as DatosFichaNueva["archivos"],
    entregas: (entregas.data ?? []) as DatosFichaNueva["entregas"],
    liquidaciones: (liquidaciones.data ?? []) as DatosFichaNueva["liquidaciones"],
    desprendibles: (desprendibles.data ?? []) as DatosFichaNueva["desprendibles"],
    recibos: (recibos.data ?? []) as DatosFichaNueva["recibos"],
    lineas: (lineas.data ?? []) as DatosFichaNueva["lineas"],
    soportes: (soportes.data ?? []) as DatosFichaNueva["soportes"],
    contratos: (contratos.data ?? []) as DatosFichaNueva["contratos"],
  };

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 p-4 sm:p-6 lg:max-w-6xl">
      <Link href="/rrhh/personal" className="mb-1 inline-flex min-h-9 items-center text-xs font-semibold text-slate-600">
        ← Personal
      </Link>
      <h1 className="mb-2 text-lg font-bold text-slate-900">Nuevo empleado</h1>
      <FichaNueva id={id} hoy={hoyColombia()} datos={datos} salario={Number(empleado?.salario_base ?? 0)} />
    </div>
  );
}
