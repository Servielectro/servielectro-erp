import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { leerFormato } from "@/lib/sst/formato-servidor";
import { COLUMNAS_LECTURA, type Lectura, type Material } from "@/lib/sst/materiales";
import { SesionCapacitacion, type Convocado } from "./SesionCapacitacion";

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
  // Responsable (Victoria): encabezado, lista, capacitador, sellar, panel y evidencias. "trabajar"
  // (técnico): leer y firmar, y solo a su nombre (la cédula de su perfil).
  const gestiona = nivel === "responsable";
  const { data: usuario } = await supabase.auth.getUser();
  const perfilRes = usuario.user ? await supabase.from("perfiles").select("nombre, cedula").eq("id", usuario.user.id).maybeSingle() : { data: null };
  const perfil = perfilRes.data as { nombre: string | null; cedula: string | null } | null;
  // Estándar 1.2.2 del año de la sesión (el plan anual, migración 108) y las evidencias ya amarradas a este FOR-02.
  const [itemRes, evidenciasRes] = gestiona
    ? await Promise.all([
        supabase.from("sst_plan_items").select("id, codigo, estandar, valor").eq("codigo", "1.2.2").eq("anio", Number(f.fecha.slice(0, 4))).is("archivado_en", null).limit(1).maybeSingle(),
        supabase.from("sst_plan_evidencias").select("id, descripcion, path, subida_en").eq("formato_id", f.id).is("anulada_en", null).order("subida_en"),
      ])
    : [{ data: null }, { data: [] }];
  // Convocados (migración 131): usuarios de la app que firman desde su bandeja de Técnico.
  const convocadosRes = await supabase.from("sst_formato_convocados").select("id, perfil_id, nombre, documento, cargo, convocado_en").eq("formato_id", f.id).order("convocado_en");
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
        firmasIniciales={f.firmas.map((x) => ({ id: x.id, rol: x.rol, nombre: x.nombre, documento: x.documento, cargo: x.cargo, firmada_en_dispositivo: x.firmada_en_dispositivo, recibida_en: x.recibida_en }))}
        puedeTrabajar={nivel === "trabajar" || nivel === "responsable"}
        gestiona={gestiona}
        yo={perfil?.cedula ? { nombre: perfil.nombre ?? "", documento: perfil.cedula } : null}
        itemPlan={(itemRes.data as { id: string; codigo: string; estandar: string; valor: number | null } | null) ?? null}
        convocadosIniciales={(convocadosRes.data ?? []) as Convocado[]}
        evidenciasIniciales={(evidenciasRes.data ?? []) as { id: string; descripcion: string; path: string | null; subida_en: string }[]}
        materiales={materiales}
        materialesSinPublicar={sinPublicar}
        lecturasIniciales={(lecturasRes.data ?? []) as Lectura[]}
      />
    </div>
  );
}
