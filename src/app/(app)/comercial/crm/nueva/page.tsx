import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PIPELINE_LABEL, type TipoPipeline } from "@/lib/crm";
import { NuevaOportunidadForm } from "./NuevaOportunidadForm";
import type { ClienteResumen } from "@/lib/supabase/clientes";

export default async function NuevaOportunidadPage(props: PageProps<"/comercial/crm/nueva">) {
  const { p } = await props.searchParams;
  const tipo: TipoPipeline = p === "renovacion" ? "renovacion" : "proyecto_nuevo";

  const supabase = await createClient();
  const [{ data }, { data: cotizaciones }, { data: totales }] = await Promise.all([
    supabase
      .from("clientes")
      .select("id, nombre, nit, direccion, email, contacto, telefono")
      .eq("activo", true)
      .order("nombre"),
    supabase
      .from("cotizaciones")
      .select("id, codigo, descripcion, cliente_id")
      .order("created_at", { ascending: false }),
    supabase.from("v_cotizacion_totales_iva").select("cotizacion_id, total_cotizacion"),
  ]);
  const totalPor = new Map(
    (totales ?? []).map((t) => [t.cotizacion_id as string, Number(t.total_cotizacion)]),
  );

  return (
    <div className="mx-auto w-full max-w-md flex-1 p-4 sm:p-6">
      <Link
        href={tipo === "renovacion" ? "/comercial/crm?p=renovacion" : "/comercial/crm"}
        className="mb-2 inline-block text-sm text-slate-600"
      >
        ← Pipeline
      </Link>
      <h1 className="mb-1 text-center text-sm font-bold text-slate-900">Nuevo negocio</h1>
      <p className="mb-4 text-center text-xs text-slate-500">
        {PIPELINE_LABEL[tipo]} · entra en {tipo === "renovacion" ? "Renovación próxima" : "Solicitud"}
      </p>
      <NuevaOportunidadForm
        tipo={tipo}
        clientes={(data ?? []) as ClienteResumen[]}
        cotizaciones={(cotizaciones ?? []).map((c) => ({
          id: c.id as string,
          codigo: c.codigo as string,
          descripcion: c.descripcion as string,
          clienteId: c.cliente_id as string,
          total: totalPor.get(c.id as string) ?? null,
        }))}
      />
    </div>
  );
}
