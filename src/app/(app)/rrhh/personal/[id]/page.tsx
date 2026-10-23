import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hoyColombia } from "@/lib/crm";
import { getProyectosNombres } from "@/lib/supabase/proyectos";
import { ESTADO_LABORAL, PESTANAS, TIPO_CONTRATO, abreviaturaTitulacion, nombreCompleto, type Empleado, type Pestana } from "@/lib/personal";
import { fechaCorta } from "@/lib/rrhh-registros";
import { BUCKET_PERSONAL } from "@/components/rrhh/archivos";
import { TabDatos, camposDe } from "../TabDatos";
import { TabAccesos, TabDotacion, TabHojaVida, type ArchivoEmpleado, type Entrega, type Herramienta } from "../TabsFicha";
import { TabCajaMenor, TabDesprendible, TabSueldo, type Desprendible, type LineaCaja, type Liquidacion, type ReciboCaja, type SoporteCaja } from "../TabsPagos";
import { FotoEmpleado } from "../FotoEmpleado";

// La ficha del empleado con sus ocho pestañas (docs/nexgo-personal-ficha-empleado.md). Cada
// pestaña carga solo lo suyo. Todo exige RRHH "trabajar" (RLS de la migración 66).
export default async function FichaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; creado?: string }>;
}) {
  const { id } = await params;
  const { tab: tabParam, creado } = await searchParams;
  const tab: Pestana = (PESTANAS.find((p) => p.id === tabParam)?.id ?? "datos") as Pestana;
  const supabase = await createClient();
  const { data } = await supabase.from("empleados").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const e = data as Empleado;
  const hoy = hoyColombia();
  const foto = e.foto_path ? (await supabase.storage.from(BUCKET_PERSONAL).createSignedUrl(e.foto_path, 600)).data?.signedUrl ?? null : null;
  const titulo = abreviaturaTitulacion(e.titulacion);

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 p-4 sm:p-6 lg:max-w-6xl">
      <Link href="/rrhh/personal" className="mb-1 inline-flex min-h-9 items-center text-xs font-semibold text-slate-600">
        ← Personal
      </Link>
      <div className="mb-3 flex items-start gap-3">
        <FotoEmpleado empleadoId={e.id} url={foto} />
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-bold text-slate-900">
            {titulo ? `${titulo} ` : ""}
            {nombreCompleto(e)}
          </h1>
          <p className="text-xs text-slate-600">
            {e.tipo_documento} {e.numero_documento}
            {e.cargo ? ` · ${e.cargo}` : ""} · {ESTADO_LABORAL[e.estado_laboral] ?? e.estado_laboral}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <a href={`/rrhh/personal/${e.id}/imprimir?doc=ficha`} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold">
              Ficha PDF
            </a>
            <a href={`/rrhh/personal/${e.id}/imprimir?doc=carnet`} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold">
              Carnet PDF
            </a>
          </div>
        </div>
      </div>
      {creado && <p className="mb-3 rounded-md bg-green-50 px-3 py-2 text-xs text-green-800">Ficha guardada. Ya puedes completar las demás pestañas.</p>}

      <nav className="-mx-4 mb-3 flex gap-1 overflow-x-auto overscroll-x-contain px-4 pb-1">
        {PESTANAS.map((p) => (
          <Link
            key={p.id}
            href={`/rrhh/personal/${e.id}?tab=${p.id}`}
            className={`flex min-h-9 shrink-0 items-center rounded-md border px-3 text-xs font-semibold ${
              p.id === tab ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700"
            }`}
          >
            {p.nombre}
          </Link>
        ))}
      </nav>

      {tab === "datos" && <Datos e={e} />}
      {tab === "hoja" && <HojaVida e={e} />}
      {tab === "contrato" && <Contratos e={e} />}
      {tab === "accesos" && <Accesos e={e} />}
      {tab === "dotacion" && <Dotacion e={e} hoy={hoy} />}
      {tab === "sueldo" && <Sueldo e={e} />}
      {tab === "desprendible" && <Desprendibles e={e} hoy={hoy} />}
      {tab === "caja" && <Caja e={e} hoy={hoy} />}
    </div>
  );
}

async function Datos({ e }: { e: Empleado }) {
  const supabase = await createClient();
  const [vigentes, propio] = await Promise.all([
    supabase.rpc("fn_parametros_vigentes"),
    supabase.from("empleado_parametros").select("valor").eq("empleado_id", e.id).eq("clave", "auxilio_transporte").maybeSingle(),
  ]);
  const empresa = ((vigentes.data ?? []) as { clave: string; valor: number | null }[]).find((p) => p.clave === "auxilio_transporte")?.valor ?? null;
  return (
    <TabDatos
      id={e.id}
      inicial={camposDe(e)}
      auxilioEmpresa={empresa === null ? null : Number(empresa)}
      auxilioPropio={propio.data ? Number(propio.data.valor) : null}
    />
  );
}

async function HojaVida({ e }: { e: Empleado }) {
  const supabase = await createClient();
  const { data } = await supabase.from("empleado_archivos").select("id, tipo, storage_path, nombre_archivo, subido_en").eq("empleado_id", e.id).order("subido_en", { ascending: false });
  return <TabHojaVida empleadoId={e.id} notas={e.notas_hoja_vida ?? ""} archivos={(data ?? []) as ArchivoEmpleado[]} />;
}

async function Contratos({ e }: { e: Empleado }) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("contratos_laborales")
    .select("id, tipo, clase, estado, fecha_contrato, fecha_inicio, fecha_fin")
    .eq("empleado_id", e.id)
    .order("created_at", { ascending: false });
  const contratos = (data ?? []) as { id: string; tipo: string; clase: string; estado: string; fecha_contrato: string | null; fecha_inicio: string | null; fecha_fin: string | null }[];
  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-600">
        Los contratos se arman en RRHH → Contratos laborales desde una plantilla, y se asocian a esta ficha. Tipo de contrato en la ficha:{" "}
        <span className="font-semibold">{e.tipo_contrato ? TIPO_CONTRATO[e.tipo_contrato] : "sin definir"}</span>.
      </p>
      <Link href={`/rrhh/contratos/nuevo?empleado=${e.id}`} className="flex min-h-11 items-center justify-center rounded-lg bg-slate-900 text-sm font-semibold text-white">
        + Generar contrato para esta persona
      </Link>
      <ul className="divide-y divide-slate-200 rounded-lg border border-slate-300 bg-white">
        {contratos.length === 0 && <li className="p-3 text-xs text-slate-500">Sin contratos todavía.</li>}
        {contratos.map((c) => (
          <li key={c.id}>
            <Link href={`/rrhh/contratos/${c.id}`} className="block p-3 text-sm active:bg-slate-50">
              <p className="font-semibold">
                {TIPO_CONTRATO[c.tipo] ?? c.tipo}
                {c.clase === "otro_si" ? " · Otro sí" : c.clase === "renovacion" ? " · Renovación" : ""}
              </p>
              <p className="text-xs text-slate-600">
                {c.estado} · {c.fecha_inicio ? `desde ${fechaCorta(c.fecha_inicio)}` : "sin fecha de inicio"}
                {c.fecha_fin ? ` hasta ${fechaCorta(c.fecha_fin)}` : ""}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

async function Accesos({ e }: { e: Empleado }) {
  const supabase = await createClient();
  const [personas, enlazados] = await Promise.all([supabase.rpc("fn_personas_rrhh"), supabase.from("empleados").select("perfil_id").not("perfil_id", "is", null).neq("id", e.id)]);
  return (
    <TabAccesos
      empleadoId={e.id}
      perfilId={e.perfil_id}
      personas={(personas.data ?? []) as { id: string; nombre: string }[]}
      enlazados={((enlazados.data ?? []) as { perfil_id: string }[]).map((x) => x.perfil_id)}
    />
  );
}

async function Dotacion({ e, hoy }: { e: Empleado; hoy: string }) {
  const supabase = await createClient();
  const [entregas, herramientas] = await Promise.all([
    supabase.from("dotacion_entregas").select("id, categoria, herramienta_id, nombre, cantidad, talla, fecha_entrega, foto_path, observacion, devuelta_en").eq("empleado_id", e.id).order("fecha_entrega", { ascending: false }),
    supabase.from("herramientas").select("id, nombre, serial, estado").order("nombre"),
  ]);
  return (
    <TabDotacion
      empleadoId={e.id}
      tallas={{ talla_camisa: e.talla_camisa ?? "", talla_pantalon: e.talla_pantalon ?? "", talla_botas: e.talla_botas ?? "" }}
      entregas={(entregas.data ?? []) as Entrega[]}
      herramientas={(herramientas.data ?? []) as Herramienta[]}
      hoy={hoy}
    />
  );
}

async function Sueldo({ e }: { e: Empleado }) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("liquidaciones")
    .select("*, liquidacion_lineas(seccion, concepto, cantidad, valor)")
    .eq("empleado_id", e.id)
    .order("fecha_corte", { ascending: false });
  return <TabSueldo empleadoId={e.id} perfilId={e.perfil_id} liquidaciones={(data ?? []) as Liquidacion[]} salario={Number(e.salario_base)} />;
}

async function Desprendibles({ e, hoy }: { e: Empleado; hoy: string }) {
  const supabase = await createClient();
  const { data } = await supabase.from("desprendibles").select("*").eq("empleado_id", e.id).order("periodo_fin", { ascending: false });
  return <TabDesprendible empleadoId={e.id} perfilId={e.perfil_id} desprendibles={(data ?? []) as Desprendible[]} hoy={hoy} />;
}

async function Caja({ e, hoy }: { e: Empleado; hoy: string }) {
  const supabase = await createClient();
  const { data: recibos } = await supabase.from("v_caja_menor_recibos").select("id, concepto, proyecto_id, fecha_entrega, total, anulado_en, motivo_anulacion").eq("empleado_id", e.id).order("fecha_entrega", { ascending: false });
  const ids = ((recibos ?? []) as ReciboCaja[]).map((r) => r.id);
  const [lineas, soportes, proyectos] = await Promise.all([
    ids.length ? supabase.from("caja_menor_lineas").select("recibo_id, concepto, documento_soporte, valor").in("recibo_id", ids).order("orden") : Promise.resolve({ data: [] }),
    ids.length ? supabase.from("caja_menor_soportes").select("recibo_id, storage_path, nombre_archivo").in("recibo_id", ids) : Promise.resolve({ data: [] }),
    getProyectosNombres(supabase),
  ]);
  return (
    <TabCajaMenor
      empleadoId={e.id}
      recibos={(recibos ?? []) as ReciboCaja[]}
      lineas={(lineas.data ?? []) as LineaCaja[]}
      soportes={(soportes.data ?? []) as SoporteCaja[]}
      proyectos={(proyectos ?? []).filter((p) => p.estado === "EN_EJECUCION")}
      hoy={hoy}
    />
  );
}

