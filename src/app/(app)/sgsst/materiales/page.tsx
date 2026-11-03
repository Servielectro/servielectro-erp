import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { duracion } from "@/lib/sst/materiales";
import { AccionesMaterial, SubirMaterial } from "./SubirMaterial";

interface Fila {
  id: string;
  codigo: string;
  nombre: string;
  version: number;
  descripcion: string | null;
  path: string;
  nombre_archivo: string;
  bytes: number | null;
  minutos_lectura: number | null;
  estado: "borrador" | "publicado" | "archivado";
  vigente_desde: string | null;
  subido_en: string;
  motivo_archivo: string | null;
}

const ESTADO: Record<Fila["estado"], string> = { borrador: "Borrador", publicado: "Publicado", archivado: "Archivado" };

// Material de capacitación SG-SST (migración 130): lo que el participante lee antes de firmar el
// FOR-02. Una versión nueva de un código reemplaza a la publicada (queda archivada, no se borra).
export default async function MaterialesPage() {
  const supabase = await createClient();
  const [{ data, error }, nivelRes, lecturasRes, exigidosRes] = await Promise.all([
    supabase
      .from("sst_materiales")
      .select("id, codigo, nombre, version, descripcion, path, nombre_archivo, bytes, minutos_lectura, estado, vigente_desde, subido_en, motivo_archivo")
      .order("codigo")
      .order("version", { ascending: false }),
    // Devuelve el nivel (consultar / trabajar / responsable) o null; no es booleano.
    supabase.rpc("fn_permiso_seccion", { p_modulo: "sgsst", p_seccion: "materiales" }),
    supabase.from("sst_material_lecturas").select("material_id, segundos").not("cerrado_en", "is", null).limit(5000),
    supabase.from("sst_plantilla_materiales").select("codigo"),
  ]);
  const nivel = nivelRes.data as string | null;
  const trabaja = nivel === "trabajar" || nivel === "responsable";
  const filas = (data ?? []) as Fila[];
  const lecturas = (lecturasRes.data ?? []) as { material_id: string; segundos: number | null }[];
  const exigidos = new Set(((exigidosRes.data ?? []) as { codigo: string }[]).map((e) => e.codigo));
  const codigos = [...new Set(filas.map((f) => f.codigo))];
  const faltan = [...exigidos].filter((c) => !filas.some((f) => f.codigo === c && f.estado === "publicado"));

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 space-y-4 p-4 sm:p-6">
      <Link href="/sgsst" className="text-sm text-slate-600 underline">
        ← SG-SST
      </Link>
      <h1 className="text-lg font-bold text-slate-900">Materiales de capacitación</h1>
      <p className="text-sm text-slate-600">Lo que cada participante abre y lee en el celular antes de firmar la capacitación. Queda registrado quién lo abrió y cuánto tiempo.</p>
      {faltan.length > 0 && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Las capacitaciones exigen {faltan.join(", ")} y no hay versión publicada: súbalo con ese código.
        </p>
      )}
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">No se pudo leer el listado: {error.message}</p>}
      {!error && filas.length === 0 && <p className="text-sm text-slate-600">Todavía no hay materiales.</p>}

      {codigos.map((codigo) => (
        <section key={codigo} className="space-y-2">
          <h2 className="text-base font-bold text-slate-900">
            {codigo}
            {exigidos.has(codigo) && <span className="ml-2 text-xs font-normal text-slate-500">(lo exige una plantilla)</span>}
          </h2>
          <ul className="space-y-2">
            {filas
              .filter((f) => f.codigo === codigo)
              .map((f) => {
                const suyas = lecturas.filter((l) => l.material_id === f.id);
                const promedio = suyas.length ? Math.round(suyas.reduce((t, l) => t + (l.segundos ?? 0), 0) / suyas.length) : null;
                return (
                  <li key={f.id} className={`rounded-xl border p-3 ${f.estado === "publicado" ? "border-green-700" : "border-slate-300"}`}>
                    <p className="font-semibold text-slate-900">{f.nombre}</p>
                    <p className="text-sm text-slate-600">
                      Versión {f.version} · {ESTADO[f.estado]}
                      {f.vigente_desde ? ` desde ${f.vigente_desde}` : ""}
                      {f.minutos_lectura ? ` · unos ${f.minutos_lectura} min` : ""}
                      {f.bytes ? ` · ${(f.bytes / 1024 / 1024).toFixed(1)} MB` : ""}
                    </p>
                    {f.descripcion && <p className="mt-1 text-sm text-slate-700">{f.descripcion}</p>}
                    <p className="mt-1 text-sm text-slate-700">
                      {suyas.length ? `Leído ${suyas.length} ${suyas.length === 1 ? "vez" : "veces"} · en promedio ${duracion(promedio)}` : "Nadie lo ha leído todavía."}
                    </p>
                    {f.estado === "archivado" && f.motivo_archivo && <p className="text-xs text-slate-500">Archivado: {f.motivo_archivo}</p>}
                    <AccionesMaterial id={f.id} path={f.path} estado={f.estado} nombre={f.nombre} puedeCambiar={trabaja} />
                  </li>
                );
              })}
          </ul>
        </section>
      ))}

      {trabaja && <SubirMaterial codigosExigidos={faltan} />}
    </div>
  );
}
