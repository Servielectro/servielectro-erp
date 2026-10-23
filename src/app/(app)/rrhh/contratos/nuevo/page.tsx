import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { MarcoRrhh } from "@/components/rrhh/FiltrosRrhh";
import { nombreCompleto, type Empleado } from "@/lib/personal";
import { hoyColombia } from "@/lib/crm";
import { GenerarContrato } from "./GenerarContrato";

export default async function NuevoContratoPage({ searchParams }: { searchParams: Promise<{ empleado?: string }> }) {
  const { empleado } = await searchParams;
  const supabase = await createClient();
  const { data: veTodo } = await supabase.rpc("fn_rrhh_ve_todo");
  if (veTodo !== true) {
    return (
      <MarcoRrhh titulo="Generar contrato">
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">Generar contratos requiere RRHH en nivel “trabajar”.</p>
      </MarcoRrhh>
    );
  }
  const [plantillas, empleados] = await Promise.all([
    supabase.from("contrato_plantillas").select("id, tipo, nombre").eq("activa", true).order("nombre"),
    supabase
      .from("empleados")
      .select("id, primer_nombre, otros_nombres, primer_apellido, segundo_apellido, tipo_documento, numero_documento, salario_base, tipo_contrato, cargo, ciudad")
      .neq("estado_laboral", "retirado")
      .order("primer_apellido"),
  ]);
  const lista = ((empleados.data ?? []) as Empleado[]).map((e) => ({
    id: e.id,
    nombre: nombreCompleto(e),
    tipo_documento: e.tipo_documento,
    numero_documento: e.numero_documento,
    salario: Number(e.salario_base),
    tipo_contrato: e.tipo_contrato,
    cargo: e.cargo,
    ciudad: e.ciudad,
  }));
  return (
    <MarcoRrhh titulo="Generar contrato" ayuda="Elija la plantilla y el colaborador. Las cláusulas, pólizas y cronograma se copian de la plantilla; revise y ajuste antes de pasarlo a vigente.">
      <Link href="/rrhh/contratos" className="mb-2 inline-flex min-h-9 items-center text-xs font-semibold text-slate-600">
        ← Contratos
      </Link>
      <GenerarContrato
        plantillas={(plantillas.data ?? []) as { id: string; tipo: string; nombre: string }[]}
        empleados={lista}
        empleadoInicial={empleado ?? ""}
        hoy={hoyColombia()}
      />
    </MarcoRrhh>
  );
}
