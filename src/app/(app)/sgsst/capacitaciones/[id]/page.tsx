import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { leerFormato } from "@/lib/sst/formato-servidor";
import { COLUMNAS_LECTURA, type Lectura, type Material } from "@/lib/sst/materiales";
import { SesionCapacitacion } from "./SesionCapacitacion";

// La pantalla de hoy: el celular pasa de mano en mano y cada participante firma el FOR-02.
export default async function CapacitacionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const [f, nivelRes] = await Promise.all([
    leerFormato(supabase, id),
    supabase.rpc("fn_permiso_seccion", { p_modulo: "sgsst", p_seccion: "capacitaciones" }),
  ]);
  if (!f || f.plantilla?.codigo !== "FOR-02") notFound();
  const nivel = nivelRes.data as string | null;
  // El material que la plantilla exige (sst_plantilla_materiales), en su versión publicada, y quién
  // lo ha leído en esta sesión.
  const [exigidosRes, lecturasRes] = await Promise.all([
    supabase.from("sst_plantilla_materiales").select("codigo, obligatorio").eq("plantilla_id", f.plantilla.id),
    supabase.from("sst_material_lecturas").select(COLUMNAS_LECTURA).eq("formato_id", f.id).order("abierto_en"),
  ]);
  const exigidos = (exigidosRes.data ?? []) as { codigo: string; obligatorio: boolean }[];
  const publicadosRes = exigidos.length
    ? await supabase.from("sst_materiales").select("id, codigo, nombre, version, path, minutos_lectura").eq("estado", "publicado").in("codigo", exigidos.map((e) => e.codigo))
    : { data: [] };
  const publicados = (publicadosRes.data ?? []) as Omit<Material, "obligatorio">[];
  const materiales: Material[] = publicados.map((m) => ({ ...m, obligatorio: exigidos.find((e) => e.codigo === m.codigo)?.obligatorio ?? true }));
  const sinPublicar = exigidos.filter((e) => !publicados.some((m) => m.codigo === e.codigo)).map((e) => e.codigo);
  return (
    <div className="mx-auto w-full max-w-xl flex-1 space-y-3 p-4">
      <Link href="/sgsst/capacitaciones" className="text-sm text-slate-600 underline">
        ← Capacitaciones
      </Link>
      <SesionCapacitacion
        id={f.id}
        fecha={f.fecha}
        lugar={f.lugar}
        campos={f.plantilla.campos}
        respuestas={f.respuestas}
        estadoInicial={f.estado}
        asistentesIniciales={(f.tecnicos_en_obra ?? []).map((t) => ({ nombre: t.nombre, documento: t.documento, cargo: (t.cargo as string | null | undefined) ?? null }))}
        firmasIniciales={f.firmas.map((x) => ({ id: x.id, rol: x.rol, nombre: x.nombre, documento: x.documento, cargo: x.cargo }))}
        puedeTrabajar={nivel === "trabajar" || nivel === "responsable"}
        materiales={materiales}
        materialesSinPublicar={sinPublicar}
        lecturasIniciales={(lecturasRes.data ?? []) as Lectura[]}
      />
    </div>
  );
}
