import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { tienePermiso } from "@/lib/permisos";
import { COLUMNAS_DOC_PERSONA, SEMAFORO, semaforo, vigenteDe, type DocPersona, type Semaforo } from "@/lib/sst/personal";
import { NuevoTrabajador } from "./NuevoTrabajador";

interface Fila {
  clave: string;
  nombre: string;
  documento: string;
  cargo: string | null;
  de: string;
  activo: boolean;
  docs: DocPersona[];
}

function Luz({ titulo, s, detalle }: { titulo: string; s: Semaforo; detalle?: string | null }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${SEMAFORO[s].clase}`}>
      <b>{titulo}</b> {detalle ?? SEMAFORO[s].nombre}
    </span>
  );
}

/**
 * Personal en SG-SST (migración 107). La ficha de nómina es de RRHH y aquí se ve SIN plata; los
 * trabajadores de contratistas los registra SG-SST. Por persona, el semáforo de lo que pide el
 * permiso de alturas (FOR-15): aptitud, certificado de alturas y afiliaciones.
 */
export default async function PersonalSgsstPage({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  const { ver } = await searchParams;
  const supabase = await createClient();
  const [fichaRes, trabajadoresRes, contratistasRes, docsRes, trabaja] = await Promise.all([
    supabase.rpc("fn_sst_personal_ficha"),
    supabase.from("contratista_trabajadores").select("id, contratista_id, nombre, tipo_documento, numero_documento, cargo, activo").order("nombre"),
    supabase.rpc("fn_sst_contratistas"),
    supabase.from("persona_documentos").select(COLUMNAS_DOC_PERSONA).eq("archivado", false),
    tienePermiso("sgsst", "trabajar"),
  ]);
  if (fichaRes.error) {
    return (
      <div className="mx-auto w-full max-w-3xl flex-1 p-4 sm:p-6">
        <Link href="/sgsst" className="text-sm text-slate-600 underline">
          ← SG-SST
        </Link>
        <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">Para ver el personal falta correr la migración 107.</p>
      </div>
    );
  }
  const docs = (docsRes.data ?? []) as DocPersona[];
  const contratistas = (contratistasRes.data ?? []) as { id: string; nombre: string; activo: boolean }[];
  const nombreContratista = new Map(contratistas.map((c) => [c.id, c.nombre]));

  const nomina: Fila[] = ((fichaRes.data ?? []) as { id: string; nombre: string; tipo_documento: string; numero_documento: string; cargo: string | null; estado_laboral: string }[]).map((e) => ({
    clave: `e-${e.id}`,
    nombre: e.nombre,
    documento: `${e.tipo_documento} ${e.numero_documento}`,
    cargo: e.cargo,
    de: "Nómina",
    activo: e.estado_laboral !== "retirado",
    docs: docs.filter((d) => d.empleado_id === e.id),
  }));
  const externos: Fila[] = ((trabajadoresRes.data ?? []) as { id: string; contratista_id: string; nombre: string; tipo_documento: string; numero_documento: string; cargo: string | null; activo: boolean }[]).map((t) => ({
    clave: `c-${t.id}`,
    nombre: t.nombre,
    documento: `${t.tipo_documento} ${t.numero_documento}`,
    cargo: t.cargo,
    de: nombreContratista.get(t.contratista_id) ?? "Contratista",
    activo: t.activo,
    docs: docs.filter((d) => d.contratista_trabajador_id === t.id),
  }));
  const pestanas = [
    { id: "nomina", nombre: "Nómina", filas: nomina },
    { id: "contratistas", nombre: "Contratistas", filas: externos },
  ];
  const actual = pestanas.find((p) => p.id === ver) ?? pestanas[0];

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 space-y-3 p-4 sm:p-6 lg:max-w-5xl">
      <Link href="/sgsst" className="text-sm text-slate-600 underline">
        ← SG-SST
      </Link>
      <div>
        <h1 className="text-lg font-bold text-slate-900">Personal</h1>
        <p className="text-sm text-slate-600">
          Exámenes, alturas, afiliaciones, capacitaciones y EPP de cada persona. La ficha de nómina la crea RRHH; aquí se ve sin salarios.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {pestanas.map((p) => (
          <Link
            key={p.id}
            href={`/sgsst/personal?ver=${p.id}`}
            className={`inline-flex min-h-11 items-center rounded-full border px-3 text-sm ${p.id === actual.id ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300"}`}
          >
            {p.nombre} · {p.filas.length}
          </Link>
        ))}
      </div>
      {actual.id === "contratistas" && trabaja && <NuevoTrabajador contratistas={contratistas.filter((c) => c.activo)} />}
      {actual.filas.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-600">
          {actual.id === "nomina" ? "No hay personas de nómina: las crea RRHH en su ficha de personal." : "No hay trabajadores de contratistas registrados."}
        </p>
      ) : (
        <ul className="space-y-2 lg:grid lg:grid-cols-2 lg:gap-2 lg:space-y-0">
          {actual.filas.map((f) => {
            const aptitud = vigenteDe(f.docs, "aptitud_ocupacional");
            const alturas = vigenteDe(f.docs, "certificado_alturas");
            const afiliaciones = ["eps", "afp", "arl", "ccf"].filter((s) => vigenteDe(f.docs, "certificado_afiliacion", (d) => d.subsistema === s)).length;
            return (
              <li key={f.clave}>
                <Link href={`/sgsst/personal/${f.clave}`} className={`block h-full rounded-lg border bg-white p-3 ${f.activo ? "border-slate-200" : "border-dashed border-slate-300 opacity-70"}`}>
                  <p className="font-semibold text-slate-900">{f.nombre}</p>
                  <p className="text-xs text-slate-600">
                    {f.documento} · {f.cargo ?? "sin cargo"} · {f.de}
                    {f.activo ? "" : " · retirado"}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    <Luz titulo="Aptitud" s={semaforo(aptitud?.vence_en, !!aptitud)} detalle={aptitud?.resultado === "no_apto" ? "NO APTO" : null} />
                    <Luz titulo="Alturas" s={semaforo(alturas?.vence_en, !!alturas)} />
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ${afiliaciones === 4 ? "bg-green-100 text-green-800" : "bg-slate-100 text-slate-600"}`}>
                      <b>Afiliaciones</b>&nbsp;{afiliaciones} de 4
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

