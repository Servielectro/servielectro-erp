import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { tienePermiso } from "@/lib/permisos";

export default async function SgsstPage() {
  const supabase = await createClient();
  const [trabaja, gestiona, borradores, porAprobar, reportesNuevos, eventosAbiertos] = await Promise.all([
    tienePermiso("sgsst", "trabajar"),
    tienePermiso("sgsst", "responsable"),
    supabase.from("sst_formatos").select("id", { count: "exact", head: true }).eq("estado", "borrador").eq("ambito", "sgsst"),
    supabase.from("sst_formatos").select("id", { count: "exact", head: true }).eq("estado", "firmado").eq("ambito", "sgsst"),
    supabase.from("sst_reportes_inseguros").select("id", { count: "exact", head: true }).in("estado", ["nuevo", "en_gestion"]),
    supabase.from("sst_eventos").select("id", { count: "exact", head: true }).in("estado", ["abierto", "investigado"]),
  ]);
  const tarjetas = [
    trabaja && { href: "/sgsst/campo", icono: "📋", nombre: "Llenar un formato en sitio", ayuda: "ATS, permisos, inspecciones: con fotos y firmas. Funciona sin señal." },
    { href: "/sgsst/formatos", icono: "🗂️", nombre: "Formatos llenados", ayuda: `${borradores.count ?? 0} en llenado · ${porAprobar.count ?? 0} firmados por aprobar` },
    { href: "/sgsst/plantillas", icono: "🧩", nombre: "Plantillas", ayuda: gestiona ? "Arma los formatos: campos, fotos, firmas." : "Los formatos disponibles." },
    { href: "/sgsst/reportes", icono: "⚠️", nombre: "Actos y condiciones inseguras", ayuda: `${reportesNuevos.count ?? 0} por atender` },
    { href: "/sgsst/eventos", icono: "🚑", nombre: "Accidentes e incidentes", ayuda: `${eventosAbiertos.count ?? 0} abiertos` },
    { href: "/sgsst/plan", icono: "📈", nombre: "Plan de trabajo", ayuda: "Estándares, responsables, fechas, evidencias y avance." },
    { href: "/sgsst/plazos", icono: "⏱️", nombre: "Plazos de reporte", ayuda: "ARL, EPS e investigación: los define la responsable SST." },
  ].filter(Boolean) as { href: string; icono: string; nombre: string; ayuda: string }[];
  return (
    <div className="mx-auto w-full max-w-3xl flex-1 p-4 sm:p-6 lg:max-w-6xl">
      <h1 className="mb-4 text-center text-sm font-bold text-slate-900">SG-SST</h1>
      <div className="space-y-3 lg:grid lg:grid-cols-3 lg:gap-3 lg:space-y-0">
        {tarjetas.map((t) => (
          <Link key={t.href} href={t.href} className="flex items-center gap-3 rounded-lg border border-slate-300 bg-white p-4 shadow-sm active:bg-slate-50">
            <span className="text-2xl">{t.icono}</span>
            <div>
              <p className="text-sm font-semibold text-slate-900">{t.nombre}</p>
              <p className="text-xs text-slate-600">{t.ayuda}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
