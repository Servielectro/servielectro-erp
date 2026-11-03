import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { leerFormato } from "@/lib/sst/formato-servidor";
import { camposFor02 } from "@/lib/sst/capacitaciones";
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
  return (
    <div className="mx-auto w-full max-w-xl flex-1 space-y-3 p-4">
      <Link href="/sgsst/capacitaciones" className="text-sm text-slate-600 underline">
        ← Capacitaciones
      </Link>
      <SesionCapacitacion
        id={f.id}
        fecha={f.fecha}
        lugar={f.lugar}
        campos={camposFor02(f.plantilla.campos)}
        respuestas={f.respuestas}
        estadoInicial={f.estado}
        asistentesIniciales={(f.tecnicos_en_obra ?? []).map((t) => ({ nombre: t.nombre, documento: t.documento, cargo: (t.cargo as string | null | undefined) ?? null }))}
        firmasIniciales={f.firmas.map((x) => ({ id: x.id, rol: x.rol, nombre: x.nombre, documento: x.documento, cargo: x.cargo }))}
        puedeTrabajar={nivel === "trabajar" || nivel === "responsable"}
      />
    </div>
  );
}
