import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { tienePermiso } from "@/lib/permisos";
import { COLUMNAS_REUNION, type Reunion } from "@/lib/reuniones/acta";
import { ReunionDetalle } from "./ReunionDetalle";
import { DescartarBorrador } from "@/components/DescartarBorrador";

export default async function ReunionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data }, trabaja, gestiona, asigna, porQueNo] = await Promise.all([
    supabase.from("reuniones").select(COLUMNAS_REUNION).eq("id", id).maybeSingle(),
    tienePermiso("proyectos", "trabajar"),
    tienePermiso("proyectos", "responsable"),
    tienePermiso("operativo", "trabajar"),
    // Migración 92: null = se puede descartar. Sin la 92, error → no se ofrece.
    supabase.rpc("fn_reunion_por_que_no_descartar", { p_reunion_id: id }),
  ]);
  if (!data) notFound();
  const descartable = !porQueNo.error && porQueNo.data === null;
  const r = data as Reunion;
  const [obraRes, perfilesRes, tareasRes, personasRes, audioRes] = await Promise.all([
    supabase.from("proyectos").select("codigo, nombre").eq("id", r.proyecto_id).maybeSingle(),
    supabase.from("perfiles").select("id, nombre").in("id", [r.aviso_por, r.aprobada_por].filter(Boolean) as string[]),
    r.estado === "aprobada" ? supabase.from("reunion_tareas").select("indice, tarea_id").eq("reunion_id", id) : Promise.resolve({ data: [] }),
    r.estado === "aprobada" && asigna ? supabase.rpc("fn_personas_asignables") : Promise.resolve({ data: [] }),
    r.audio_path ? supabase.storage.from("reuniones").createSignedUrl(r.audio_path, 3600) : Promise.resolve({ data: null }),
  ]);
  const nombres = Object.fromEntries(((perfilesRes.data ?? []) as { id: string; nombre: string }[]).map((p) => [p.id, p.nombre]));
  const hechas = Object.fromEntries(((tareasRes.data ?? []) as { indice: number; tarea_id: string }[]).map((t) => [t.indice, t.tarea_id]));
  const obra = obraRes.data ? `${obraRes.data.codigo} · ${obraRes.data.nombre}` : "Obra";
  return (
    <div className="mx-auto w-full max-w-3xl flex-1 space-y-3 p-4 sm:p-6">
      <Link href={`/proyectos/reuniones?proyecto=${r.proyecto_id}`} className="text-sm text-slate-600 underline">
        ← Reuniones de la obra
      </Link>
      <ReunionDetalle
        r={r}
        obra={obra}
        trabaja={trabaja}
        gestiona={gestiona}
        nombres={nombres}
        audioUrl={(audioRes.data as { signedUrl?: string } | null)?.signedUrl ?? null}
        tieneTranscripcion={!!r.transcripcion}
        transcripcion={r.transcripcion}
        hechas={hechas}
        personas={(personasRes.data ?? []) as { id: string; nombre: string }[]}
        puedeAsignar={asigna}
      />
      {descartable && (
        <DescartarBorrador funcion="fn_descartar_reunion" id={r.id} que="la reunión" volverA={`/proyectos/reuniones?proyecto=${r.proyecto_id}`} />
      )}
    </div>
  );
}
