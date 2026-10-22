import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requierePermiso, tienePermiso } from "@/lib/permisos";
import { getClientesActivos, type ClienteResumen } from "@/lib/supabase/clientes";
import { FormProyecto } from "../FormProyecto";

export default async function NuevoProyectoPage() {
  if (!(await tienePermiso("comercial", "trabajar"))) await requierePermiso("proyectos", "trabajar");
  const supabase = await createClient();
  const veClientes = await tienePermiso("comercial", "consultar");
  const clientes = veClientes ? await getClientesActivos(supabase).catch(() => [] as ClienteResumen[]) : [];
  const anio = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric" }).format(new Date());

  return (
    <div className="mx-auto w-full max-w-xl flex-1 p-4 sm:p-6">
      <Link href="/proyectos" className="mb-2 inline-block text-xs font-semibold text-slate-600">
        ← Proyectos
      </Link>
      <h1 className="mb-4 text-center text-sm font-bold text-slate-900">Nuevo proyecto</h1>
      <FormProyecto
        inicial={{
          nombre: "",
          codigo: "",
          clienteId: null,
          clienteNombre: "",
          estado: "EN_EJECUCION",
          fechaInicio: "",
          fechaFinEstimada: "",
          descripcion: "",
        }}
        clientes={clientes}
        veClientes={veClientes}
        tieneCotizacion={false}
        editaClienteConCotizacion={false}
        anioActual={anio}
      />
    </div>
  );
}
