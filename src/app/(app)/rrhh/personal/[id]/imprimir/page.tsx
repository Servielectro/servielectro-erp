import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PrintButton } from "@/app/(app)/comercial/cotizaciones/[id]/imprimir/PrintButton";
import { BUCKET_PERSONAL } from "@/lib/rrhh-registros";
import { ESTADO_LABORAL, TIPO_CONTRATO, TITULACIONES, abreviaturaTitulacion, nombreCompleto, type Empleado } from "@/lib/personal";
import { fechaCorta, pesos } from "@/lib/rrhh-registros";

// Ficha PDF, Carnet PDF y Acta de entrega (PDF): como la cotización, una hoja para imprimir o
// "Guardar como PDF" desde el navegador.
export default async function ImprimirFichaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ doc?: string }>;
}) {
  const { id } = await params;
  const { doc } = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.from("empleados").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const e = data as Empleado;
  const foto = e.foto_path ? (await supabase.storage.from(BUCKET_PERSONAL).createSignedUrl(e.foto_path, 600)).data?.signedUrl ?? null : null;
  const titulo = e.mostrar_titulacion_carnet ? abreviaturaTitulacion(e.titulacion) : null;

  return (
    <div className="min-h-screen bg-slate-100 px-2 pb-8 print:min-h-0 print:bg-white print:p-0">
      <div className="mx-auto flex max-w-3xl justify-end py-3 print:hidden">
        <PrintButton />
      </div>
      <div className="mx-auto max-w-3xl bg-white p-6 text-sm text-slate-900 shadow print:shadow-none">
        {doc === "carnet" ? (
          <div className="mx-auto w-[54mm] rounded-lg border-2 border-slate-900 p-3 text-center">
            <p className="text-xs font-bold tracking-wide">SERVIELECTRO SAS</p>
            {foto ? (
              // eslint-disable-next-line @next/next/no-img-element -- enlace firmado temporal
              <img src={foto} alt="" className="mx-auto my-2 h-24 w-20 rounded object-cover" />
            ) : (
              <div className="mx-auto my-2 flex h-24 w-20 items-center justify-center rounded bg-slate-100 text-2xl">👤</div>
            )}
            <p className="text-sm font-bold leading-tight">
              {titulo ? `${titulo} ` : ""}
              {nombreCompleto(e)}
            </p>
            <p className="text-xs">{e.cargo ?? ""}</p>
            <p className="mt-1 text-xs">
              {e.tipo_documento} {e.numero_documento}
            </p>
            {e.rh && <p className="text-xs">RH {e.rh}</p>}
            {e.codigo_interno && <p className="text-xs">Código {e.codigo_interno}</p>}
          </div>
        ) : doc === "acta" ? (
          <Acta e={e} />
        ) : (
          <Ficha e={e} />
        )}
      </div>
    </div>
  );
}

function Fila({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <tr className="border-b border-slate-200">
      <th className="w-1/3 py-1 pr-2 text-left align-top text-xs font-semibold text-slate-600">{k}</th>
      <td className="py-1">{v || "—"}</td>
    </tr>
  );
}

function Ficha({ e }: { e: Empleado }) {
  return (
    <>
      <h1 className="mb-3 text-lg font-bold">Ficha del colaborador</h1>
      <table className="w-full">
        <tbody>
          <Fila k="Nombre" v={nombreCompleto(e)} />
          <Fila k="Documento" v={`${e.tipo_documento} ${e.numero_documento}`} />
          <Fila k="Código interno" v={e.codigo_interno} />
          <Fila k="Titulación" v={TITULACIONES.find((t) => t.id === (e.titulacion ?? ""))?.nombre} />
          <Fila k="Cargo / área" v={[e.cargo, e.area].filter(Boolean).join(" · ")} />
          <Fila k="Estado laboral" v={ESTADO_LABORAL[e.estado_laboral]} />
          <Fila k="Correo / teléfono" v={[e.correo, e.telefono].filter(Boolean).join(" · ")} />
          <Fila k="Dirección" v={[e.direccion, e.ciudad, e.municipio_dane ? `DANE ${e.municipio_dane}` : null].filter(Boolean).join(" · ")} />
          <Fila k="Fecha nacimiento / RH" v={[e.fecha_nacimiento ? fechaCorta(e.fecha_nacimiento) : null, e.rh].filter(Boolean).join(" · ")} />
          <Fila k="EPS / AFP" v={[e.eps, e.afp].filter(Boolean).join(" · ")} />
          <Fila k="ARL / Caja" v={[e.arl, e.caja_compensacion].filter(Boolean).join(" · ")} />
          <Fila k="Contacto de emergencia" v={[e.contacto_emergencia, e.telefono_emergencia].filter(Boolean).join(" · ")} />
          <Fila k="Ingreso / retiro" v={`${fechaCorta(e.fecha_ingreso)}${e.fecha_retiro ? ` → ${fechaCorta(e.fecha_retiro)}` : ""}`} />
          <Fila k="Tipo de contrato" v={e.tipo_contrato ? TIPO_CONTRATO[e.tipo_contrato] : null} />
          <Fila k="Salario base" v={pesos(Number(e.salario_base))} />
          {e.bonificacion !== null && <Fila k="Bonificación" v={`${pesos(Number(e.bonificacion))}${e.detalle_bonificacion ? ` (${e.detalle_bonificacion})` : ""}`} />}
          {e.rodamiento !== null && <Fila k="Rodamiento" v={pesos(Number(e.rodamiento))} />}
          <Fila k="Auxilio de transporte" v={e.salario_integral ? "No (salario integral)" : e.aplica_auxilio_transporte ? "Sí" : "No"} />
          <Fila k="Tallas" v={[e.talla_camisa && `camisa ${e.talla_camisa}`, e.talla_pantalon && `pantalón ${e.talla_pantalon}`, e.talla_botas && `botas ${e.talla_botas}`].filter(Boolean).join(" · ")} />
        </tbody>
      </table>
    </>
  );
}

async function Acta({ e }: { e: Empleado }) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("dotacion_entregas")
    .select("categoria, nombre, cantidad, talla, fecha_entrega, herramientas(nombre, serial)")
    .eq("empleado_id", e.id)
    .is("devuelta_en", null)
    .order("fecha_entrega");
  const filas = (data ?? []) as unknown as { categoria: string; nombre: string | null; cantidad: number; talla: string | null; fecha_entrega: string; herramientas: { nombre: string; serial: string | null } | null }[];
  return (
    <>
      <h1 className="mb-1 text-lg font-bold">Acta de entrega de dotación y herramientas</h1>
      <p className="mb-3 text-xs">
        Colaborador: <span className="font-semibold">{nombreCompleto(e)}</span> · {e.tipo_documento} {e.numero_documento}
        {e.cargo ? ` · ${e.cargo}` : ""}
        <br />
        Tallas: camisa {e.talla_camisa ?? "—"} · pantalón {e.talla_pantalon ?? "—"} · botas {e.talla_botas ?? "—"}
      </p>
      <table className="w-full border border-slate-300 text-xs">
        <thead className="bg-slate-100">
          <tr>
            <th className="border border-slate-300 p-1 text-left">Elemento</th>
            <th className="border border-slate-300 p-1">Tipo</th>
            <th className="border border-slate-300 p-1">Cant.</th>
            <th className="border border-slate-300 p-1">Talla</th>
            <th className="border border-slate-300 p-1">Entrega</th>
          </tr>
        </thead>
        <tbody>
          {filas.length === 0 && (
            <tr>
              <td colSpan={5} className="p-2 text-center text-slate-500">
                Sin elementos entregados.
              </td>
            </tr>
          )}
          {filas.map((f, i) => (
            <tr key={i}>
              <td className="border border-slate-300 p-1">{f.herramientas ? `${f.herramientas.nombre}${f.herramientas.serial ? ` (${f.herramientas.serial})` : ""}` : f.nombre}</td>
              <td className="border border-slate-300 p-1 text-center">{f.categoria === "epp" ? "EPP" : f.categoria === "uniforme" ? "Uniforme" : "Herramienta"}</td>
              <td className="border border-slate-300 p-1 text-center">{f.cantidad}</td>
              <td className="border border-slate-300 p-1 text-center">{f.talla ?? "—"}</td>
              <td className="border border-slate-300 p-1 text-center">{fechaCorta(f.fecha_entrega)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-12 grid grid-cols-2 gap-8 text-xs">
        <div className="border-t border-slate-900 pt-1">Entrega (Servielectro SAS)</div>
        <div className="border-t border-slate-900 pt-1">
          Recibe: {nombreCompleto(e)} · {e.tipo_documento} {e.numero_documento}
        </div>
      </div>
    </>
  );
}
