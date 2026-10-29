import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { tienePermiso } from "@/lib/permisos";
import { COLUMNAS_DOC_PERSONA, type DocPersona } from "@/lib/sst/personal";
import { DocumentosPersona } from "./DocumentosPersona";
import { EppPersona, type EntregaEpp } from "./EppPersona";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Una persona en SG-SST (migración 107): sus datos sin plata, documentos con vigencias y EPP. */
export default async function PersonaSgsstPage({ params }: { params: Promise<{ clave: string }> }) {
  const { clave } = await params;
  const tipo = clave.slice(0, 2);
  const id = clave.slice(2);
  if ((tipo !== "e-" && tipo !== "c-") || !UUID.test(id)) notFound();
  const esEmpleado = tipo === "e-";
  const supabase = await createClient();

  const [fichaRes, trabajadorRes, contratistasRes, docsRes, sst, rrhh] = await Promise.all([
    esEmpleado ? supabase.rpc("fn_sst_personal_ficha") : Promise.resolve({ data: [], error: null }),
    esEmpleado ? Promise.resolve({ data: null }) : supabase.from("contratista_trabajadores").select("*").eq("id", id).maybeSingle(),
    esEmpleado ? Promise.resolve({ data: [] }) : supabase.rpc("fn_sst_contratistas"),
    supabase.from("persona_documentos").select(COLUMNAS_DOC_PERSONA).eq(esEmpleado ? "empleado_id" : "contratista_trabajador_id", id).order("subido_en", { ascending: false }),
    tienePermiso("sgsst", "trabajar"),
    tienePermiso("rrhh", "trabajar"),
  ]);
  type Datos = Record<string, string | boolean | null>;
  const persona: Datos | undefined = esEmpleado
    ? ((fichaRes.data ?? []) as Datos[]).find((e) => e.id === id)
    : ((trabajadorRes.data ?? undefined) as Datos | undefined);
  if (!persona) notFound();
  const de = esEmpleado
    ? "Nómina"
    : (((contratistasRes.data ?? []) as { id: string; nombre: string }[]).find((c) => c.id === persona.contratista_id)?.nombre ?? "Contratista");

  // EPP: entregas (de RRHH o de SG-SST), su seguimiento y sus inspecciones. Solo de nómina (la entrega cuelga del empleado).
  let entregas: EntregaEpp[] = [];
  if (esEmpleado) {
    const { data: ent } = await supabase.from("dotacion_entregas").select("id, nombre, cantidad, talla, fecha_entrega, devuelta_en, observacion").eq("empleado_id", id).eq("categoria", "epp").order("fecha_entrega", { ascending: false });
    const ids = ((ent ?? []) as { id: string }[]).map((e) => e.id);
    const [segRes, insRes] = ids.length
      ? await Promise.all([
          supabase.from("epp_seguimiento").select("entrega_id, capacitacion_uso_en, vida_util_meses, reponer_en, notas").in("entrega_id", ids),
          supabase.from("epp_inspecciones").select("id, entrega_id, fecha, estado, en_uso, observacion").in("entrega_id", ids).order("fecha", { ascending: false }),
        ])
      : [{ data: [] }, { data: [] }];
    entregas = ((ent ?? []) as Omit<EntregaEpp, "seguimiento" | "inspecciones">[]).map((e) => ({
      ...e,
      seguimiento: ((segRes.data ?? []) as EntregaEpp["seguimiento"][]).find((s) => s?.entrega_id === e.id) ?? null,
      inspecciones: ((insRes.data ?? []) as EntregaEpp["inspecciones"]).filter((i) => i.entrega_id === e.id),
    }));
  }

  const datos: [string, string | null | undefined][] = esEmpleado
    ? [
        ["Documento", `${persona.tipo_documento} ${persona.numero_documento}`],
        ["Cargo", persona.cargo as string | null],
        ["Área", persona.area as string | null],
        ["Estado", persona.estado_laboral as string | null],
        ["Ingreso", persona.fecha_ingreso as string | null],
        ["Contrato", ((persona.tipo_contrato as string | null) ?? "").replace("_", " ") || null],
        ["RH", persona.rh as string | null],
        ["EPS", persona.eps as string | null],
        ["AFP", persona.afp as string | null],
        ["ARL", persona.arl as string | null],
        ["Caja", persona.caja_compensacion as string | null],
        ["Emergencia", [persona.contacto_emergencia, persona.telefono_emergencia].filter(Boolean).join(" · ") || null],
        ["Tallas", [persona.talla_camisa && `camisa ${persona.talla_camisa}`, persona.talla_pantalon && `pantalón ${persona.talla_pantalon}`, persona.talla_botas && `botas ${persona.talla_botas}`].filter(Boolean).join(" · ") || null],
      ]
    : [
        ["Documento", `${persona.tipo_documento} ${persona.numero_documento}`],
        ["Cargo", persona.cargo as string | null],
        ["Contratista", de],
        ["RH", persona.rh as string | null],
        ["Teléfono", persona.telefono as string | null],
        ["Emergencia", [persona.contacto_emergencia, persona.telefono_emergencia].filter(Boolean).join(" · ") || null],
      ];

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 space-y-4 p-4 sm:p-6 lg:max-w-5xl">
      <Link href={`/sgsst/personal${esEmpleado ? "" : "?ver=contratistas"}`} className="text-sm text-slate-600 underline">
        ← Personal
      </Link>
      <div>
        <h1 className="text-lg font-bold text-slate-900">{persona.nombre as string}</h1>
        <p className="text-sm text-slate-600">{de}</p>
      </div>
      <section className="rounded-lg border border-slate-200 bg-white p-3">
        <dl className="grid grid-cols-[6rem_1fr] gap-x-3 gap-y-1 text-sm sm:grid-cols-[6rem_1fr_6rem_1fr]">
          {datos.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-slate-500">{k}</dt>
              <dd className="text-slate-900">{v || "—"}</dd>
            </div>
          ))}
        </dl>
        {esEmpleado && <p className="mt-2 text-xs text-slate-500">Estos datos los mantiene RRHH en la ficha del empleado.</p>}
      </section>
      <DocumentosPersona
        clave={clave as `e-${string}` | `c-${string}`}
        docs={(docsRes.data ?? []) as DocPersona[]}
        sst={sst}
        rrhh={rrhh}
      />
      {esEmpleado ? (
        <EppPersona empleadoId={id} entregas={entregas} sst={sst} />
      ) : (
        <p className="text-xs text-slate-500">El EPP de los trabajadores de contratistas lo entrega el contratista.</p>
      )}
    </div>
  );
}
