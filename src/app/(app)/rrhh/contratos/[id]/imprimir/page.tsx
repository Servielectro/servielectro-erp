import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PrintButton } from "@/app/(app)/comercial/cotizaciones/[id]/imprimir/PrintButton";
import { CLASE_CONTRATO, ESTADO_CONTRATO, FORMAS_PAGO, TIPO_CONTRATO } from "@/lib/contratos";
import { nombreCompleto } from "@/lib/personal";
import { fechaCorta, pesos } from "@/lib/rrhh-registros";

// El contrato para imprimir o guardar como PDF. Las cláusulas sin texto salen marcadas, para
// que nadie firme un contrato con huecos sin darse cuenta.
export default async function ImprimirContratoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("contratos_laborales")
    .select("*, empleados(primer_nombre, otros_nombres, primer_apellido, segundo_apellido)")
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();
  const c = data as Record<string, string | number | null> & { empleados: { primer_nombre: string; otros_nombres: string | null; primer_apellido: string; segundo_apellido: string | null } | null };
  const [cl, po, cr] = await Promise.all([
    supabase.from("contrato_clausulas").select("titulo, texto").eq("contrato_id", id).order("orden"),
    supabase.from("contrato_polizas").select("poliza, porcentaje, durante_anios, meses_extra, complemento").eq("contrato_id", id).eq("activo", true).order("orden"),
    supabase.from("contrato_cronograma").select("actividad, dia_inicio, fecha_inicio, duracion_habiles, fecha_fin, responsable").eq("contrato_id", id).order("orden"),
  ]);
  const clausulas = (cl.data ?? []) as { titulo: string; texto: string }[];
  const vacias = clausulas.filter((x) => !x.texto.trim()).length;
  const quien = c.empleados ? nombreCompleto(c.empleados) : String(c.trabajador ?? "—");
  const forma = FORMAS_PAGO.find((f) => f.id === c.forma_pago);

  return (
    <div className="min-h-screen bg-slate-100 px-2 pb-8 print:min-h-0 print:bg-white print:p-0">
      <div className="mx-auto max-w-3xl py-3 print:hidden">
        {vacias > 0 && (
          <p className="mb-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
            {vacias} {vacias === 1 ? "cláusula no tiene" : "cláusulas no tienen"} texto todavía: salen marcadas en la hoja.
          </p>
        )}
        <div className="flex justify-end">
          <PrintButton />
        </div>
      </div>
      <div className="mx-auto max-w-3xl bg-white p-8 text-sm leading-relaxed text-slate-900 shadow print:shadow-none">
        <h1 className="text-center text-base font-bold uppercase">
          {c.tipo === "prestacion_servicios" ? "Contrato de prestación de servicios" : `Contrato laboral a ${String(TIPO_CONTRATO[String(c.tipo)] ?? "").toLowerCase()}`}
        </h1>
        {c.clase !== "original" && <p className="text-center text-xs">{CLASE_CONTRATO[String(c.clase)]}</p>}
        {c.estado !== "vigente" && <p className="text-center text-xs font-semibold text-amber-700 print:text-slate-900">({ESTADO_CONTRATO[String(c.estado)]})</p>}
        <table className="my-4 w-full text-xs">
          <tbody>
            <tr>
              <td className="w-1/3 font-semibold">Empleador</td>
              <td>SERVIELECTRO SAS</td>
            </tr>
            <tr>
              <td className="font-semibold">{c.tipo === "prestacion_servicios" ? "Contratista" : "Trabajador"}</td>
              <td>
                {quien} · {c.tipo_documento ?? ""} {c.documento ?? ""}
              </td>
            </tr>
            {c.salario !== null && (
              <tr>
                <td className="font-semibold">{c.tipo === "prestacion_servicios" ? "Valor" : "Salario"}</td>
                <td>{pesos(Number(c.salario))}</td>
              </tr>
            )}
            <tr>
              <td className="font-semibold">Ciudad y fecha</td>
              <td>
                {c.ciudad_firma ?? "—"}, {fechaCorta(c.fecha_contrato as string | null)}
              </td>
            </tr>
            <tr>
              <td className="font-semibold">Vigencia</td>
              <td>
                {c.fecha_inicio ? `Desde ${fechaCorta(c.fecha_inicio as string)}` : "—"}
                {c.fecha_fin ? ` hasta ${fechaCorta(c.fecha_fin as string)}` : ""}
              </td>
            </tr>
            {c.objeto && (
              <tr>
                <td className="font-semibold">Objeto</td>
                <td>{c.objeto}</td>
              </tr>
            )}
            {forma && (
              <tr>
                <td className="font-semibold">Forma de pago</td>
                <td>
                  {forma.nombre}
                  {c.forma_pago_detalle ? ` — ${c.forma_pago_detalle}` : ""}
                </td>
              </tr>
            )}
            {c.plazo_ejecucion && (
              <tr>
                <td className="font-semibold">Plazo de ejecución</td>
                <td>{c.plazo_ejecucion}</td>
              </tr>
            )}
          </tbody>
        </table>
        {clausulas.map((x, i) => (
          <div key={i} className="mb-3">
            <p className="font-bold">
              {ordinal(i + 1)}. {x.titulo}.
            </p>
            {x.texto.trim() ? <p className="whitespace-pre-wrap">{x.texto}</p> : <p className="italic text-amber-700 print:text-slate-500">[Cláusula sin texto]</p>}
          </div>
        ))}
        {(po.data ?? []).length > 0 && (
          <>
            <p className="mt-4 font-bold">Pólizas</p>
            <ul className="list-disc pl-5 text-xs">
              {(po.data as { poliza: string; porcentaje: number | null; durante_anios: number | null; meses_extra: number | null; complemento: string | null }[]).map((p, i) => (
                <li key={i}>
                  {p.poliza}
                  {p.porcentaje !== null ? ` · ${Number(p.porcentaje)} %` : ""}
                  {p.durante_anios !== null ? ` · ${p.durante_anios} año(s)` : ""}
                  {p.meses_extra !== null ? ` y ${p.meses_extra} mes(es) más` : ""}
                  {p.complemento ? ` · ${p.complemento}` : ""}
                </li>
              ))}
            </ul>
          </>
        )}
        {(cr.data ?? []).length > 0 && (
          <>
            <p className="mt-4 font-bold">Cronograma de ejecución</p>
            <table className="w-full border border-slate-300 text-xs">
              <thead>
                <tr className="bg-slate-100">
                  <th className="border border-slate-300 p-1 text-left">Actividad</th>
                  <th className="border border-slate-300 p-1">Inicio</th>
                  <th className="border border-slate-300 p-1">Duración (hábiles)</th>
                  <th className="border border-slate-300 p-1">Fin</th>
                  <th className="border border-slate-300 p-1">Responsable</th>
                </tr>
              </thead>
              <tbody>
                {(cr.data as { actividad: string; dia_inicio: number | null; fecha_inicio: string | null; duracion_habiles: number | null; fecha_fin: string | null; responsable: string | null }[]).map((a, i) => (
                  <tr key={i}>
                    <td className="border border-slate-300 p-1">{a.actividad}</td>
                    <td className="border border-slate-300 p-1 text-center">{a.fecha_inicio ? fechaCorta(a.fecha_inicio) : a.dia_inicio !== null ? `Día ${a.dia_inicio}` : "—"}</td>
                    <td className="border border-slate-300 p-1 text-center">{a.duracion_habiles ?? "—"}</td>
                    <td className="border border-slate-300 p-1 text-center">{a.fecha_fin ? fechaCorta(a.fecha_fin) : "—"}</td>
                    <td className="border border-slate-300 p-1">{a.responsable ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
        <div className="mt-16 grid grid-cols-2 gap-8 text-xs">
          <div className="border-t border-slate-900 pt-1">Por el empleador · SERVIELECTRO SAS</div>
          <div className="border-t border-slate-900 pt-1">
            {quien} · {c.tipo_documento ?? ""} {c.documento ?? ""}
          </div>
        </div>
      </div>
    </div>
  );
}

const ORDINALES = ["PRIMERA", "SEGUNDA", "TERCERA", "CUARTA", "QUINTA", "SEXTA", "SÉPTIMA", "OCTAVA", "NOVENA", "DÉCIMA", "UNDÉCIMA", "DUODÉCIMA", "DECIMOTERCERA", "DECIMOCUARTA", "DECIMOQUINTA", "DECIMOSEXTA", "DECIMOSÉPTIMA", "DECIMOCTAVA", "DECIMONOVENA", "VIGÉSIMA"];
function ordinal(n: number) {
  return ORDINALES[n - 1] ?? String(n);
}
