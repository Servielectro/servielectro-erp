import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { tienePermiso } from "@/lib/permisos";
import { hoyColombia } from "@/lib/crm";
import { estadoPlazo, type Plazo } from "@/lib/sst/plazos";
import { GestionEvento, type EventoDetalle } from "./GestionEvento";

export default async function EventoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: e } = await supabase.from("sst_eventos").select("*").eq("id", id).maybeSingle();
  if (!e) notFound();
  const ev = e as EventoDetalle;
  const [plazosRes, personalRes, archivosRes, formatosRes, plantillasRes, trabaja, gestiona] = await Promise.all([
    supabase.rpc("fn_sst_plazos", { p_fecha: ev.ocurrido_en.slice(0, 10) }),
    supabase.rpc("fn_sst_personal"),
    supabase.from("sst_evento_archivos").select("id, descripcion, path, created_at").eq("evento_id", id).order("created_at"),
    supabase.from("sst_formatos").select("id, plantilla_id, fecha, lugar, estado").in("estado", ["firmado", "aprobado"]).order("fecha", { ascending: false }).limit(100),
    supabase.from("sst_plantillas").select("id, nombre"),
    tienePermiso("sgsst", "trabajar"),
    tienePermiso("sgsst", "responsable"),
  ]);
  const plazos = new Map(((plazosRes.data ?? []) as Plazo[]).map((p) => [p.clave, p]));
  const hoy = hoyColombia();
  const afectado = ev.empleado_id ? (((personalRes.data ?? []) as { id: string; nombre: string }[]).find((p) => p.id === ev.empleado_id)?.nombre ?? "Empleado") : ev.afectado_nombre;
  const nombrePlantilla = new Map(((plantillasRes.data ?? []) as { id: string; nombre: string }[]).map((p) => [p.id, p.nombre]));
  const archivos = (archivosRes.data ?? []) as { id: string; descripcion: string; path: string; created_at: string }[];
  const enlaces = new Map<string, string>();
  if (archivos.length) {
    const { data } = await supabase.storage.from("sgsst").createSignedUrls(archivos.map((a) => a.path), 600);
    for (const x of data ?? []) if (x.path && x.signedUrl) enlaces.set(x.path, x.signedUrl);
  }
  const plazo = (clave: string, hecho: string | null) => estadoPlazo(plazos.get(clave), ev.ocurrido_en, hecho, hoy);
  return (
    <div className="mx-auto w-full max-w-3xl flex-1 space-y-3 p-4 sm:p-6">
      <Link href="/sgsst/eventos" className="text-sm text-slate-600 underline">
        ← Accidentes e incidentes
      </Link>
      <GestionEvento
        ev={ev}
        afectado={afectado}
        plazos={{
          arl: ev.tipo === "accidente" ? plazo("plazo_reporte_arl", ev.reportado_arl_en) : null,
          eps: ev.tipo === "accidente" ? plazo("plazo_reporte_eps", ev.reportado_eps_en) : null,
          // Solo mientras está abierto: después ya quedó investigado.
          investigacion: ev.estado === "abierto" ? plazo("plazo_investigacion", null) : null,
        }}
        archivos={archivos.map((a) => ({ ...a, url: enlaces.get(a.path) ?? null }))}
        formatos={((formatosRes.data ?? []) as { id: string; plantilla_id: string; fecha: string; lugar: string | null }[]).map((f) => ({
          id: f.id,
          nombre: `${nombrePlantilla.get(f.plantilla_id) ?? "Formato"} · ${f.fecha}${f.lugar ? ` · ${f.lugar}` : ""}`,
        }))}
        trabaja={trabaja}
        gestiona={gestiona}
      />
    </div>
  );
}
