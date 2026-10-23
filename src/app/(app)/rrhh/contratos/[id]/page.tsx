import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EditorContrato } from "@/components/rrhh/EditorContrato";
import { CLASE_CONTRATO, ESTADO_CONTRATO, TIPO_CONTRATO, type Actividad, type Clausula, type Poliza } from "@/lib/contratos";
import { nombreCompleto } from "@/lib/personal";
import { hoyColombia } from "@/lib/crm";
import { AccionesContrato, DatosContratoForm, type DatosContrato } from "./AccionesContrato";

export default async function ContratoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("contratos_laborales")
    .select("*, empleados(id, primer_nombre, otros_nombres, primer_apellido, segundo_apellido)")
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();
  const c = data as DatosContrato & {
    clase: string;
    contrato_padre_id: string | null;
    trabajador: string | null;
    empleados: { id: string; primer_nombre: string; otros_nombres: string | null; primer_apellido: string; segundo_apellido: string | null } | null;
  };
  const [cl, po, cr, hijos] = await Promise.all([
    supabase.from("contrato_clausulas").select("id, orden, titulo, texto").eq("contrato_id", id).order("orden"),
    supabase.from("contrato_polizas").select("id, orden, activo, poliza, porcentaje, durante_anios, meses_extra, complemento").eq("contrato_id", id).order("orden"),
    supabase.from("contrato_cronograma").select("id, orden, actividad, dia_inicio, fecha_inicio, duracion_habiles, fecha_fin, responsable").eq("contrato_id", id).order("orden"),
    supabase.from("contratos_laborales").select("id, clase, estado").eq("contrato_padre_id", id),
  ]);
  const quien = c.empleados ? nombreCompleto(c.empleados) : (c.trabajador ?? "—");

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 space-y-3 p-4 sm:p-6">
      <Link href="/rrhh/contratos" className="inline-flex min-h-9 items-center text-xs font-semibold text-slate-600">
        ← Contratos
      </Link>
      <div>
        <h1 className="text-lg font-bold text-slate-900">{quien}</h1>
        <p className="text-xs text-slate-600">
          {TIPO_CONTRATO[c.tipo] ?? c.tipo} · {CLASE_CONTRATO[c.clase]} ·{" "}
          <span className="font-semibold">{ESTADO_CONTRATO[c.estado] ?? c.estado}</span>
          {c.empleados && (
            <>
              {" · "}
              <Link href={`/rrhh/personal/${c.empleados.id}?tab=contrato`} className="underline">
                ver ficha
              </Link>
            </>
          )}
        </p>
        {c.contrato_padre_id && (
          <p className="text-xs">
            <Link href={`/rrhh/contratos/${c.contrato_padre_id}`} className="font-semibold text-[#A82323] underline">
              Ver el contrato original
            </Link>
          </p>
        )}
        {(hijos.data ?? []).length > 0 && (
          <p className="text-xs text-slate-600">
            Derivados:{" "}
            {(hijos.data as { id: string; clase: string; estado: string }[]).map((h, i) => (
              <span key={h.id}>
                {i > 0 ? ", " : ""}
                <Link href={`/rrhh/contratos/${h.id}`} className="underline">
                  {CLASE_CONTRATO[h.clase]} ({ESTADO_CONTRATO[h.estado]})
                </Link>
              </span>
            ))}
          </p>
        )}
      </div>
      <AccionesContrato c={c} hoy={hoyColombia()} />
      <DatosContratoForm c={c} />
      <EditorContrato
        de="contrato"
        id={c.id}
        clausulas={(cl.data ?? []) as Clausula[]}
        polizas={(po.data ?? []) as Poliza[]}
        cronograma={(cr.data ?? []) as Actividad[]}
        editable={c.estado === "borrador"}
        motivoNoEditable={c.estado === "borrador" ? undefined : `El contrato está ${(ESTADO_CONTRATO[c.estado] ?? c.estado).toLowerCase()}: no se edita. Para cambiarlo, haga un Otro sí.`}
      />
    </div>
  );
}
