import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { tienePermiso } from "@/lib/permisos";
import { CADENCIA_SEMANAL, hoyBogota } from "@/lib/marketing";
import { Oportunidades, type Oportunidad } from "./Oportunidades";

/** Lunes de la semana de `dia` (AAAA-MM-DD). */
function lunesDe(dia: string): string {
  const d = new Date(`${dia}T12:00:00`);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

/**
 * Portada de Marketing (migración 125). Arriba, de qué hablar: el trabajo real que todavía no tiene
 * idea (v_marketing_oportunidades). El calendario no arranca en una hoja en blanco.
 */
export default async function MarketingPage() {
  const supabase = await createClient();
  const hoy = hoyBogota();
  const lunes = lunesDe(hoy);
  const domingo = new Date(`${lunes}T12:00:00`);
  domingo.setDate(domingo.getDate() + 6);
  const [escribe, opRes, ideasRes, semanaRes, bibRes, campRes] = await Promise.all([
    tienePermiso("marketing", "trabajar"),
    supabase.from("v_marketing_oportunidades").select("*").limit(30),
    supabase.from("marketing_ideas").select("estado").neq("estado", "descartada"),
    supabase
      .from("marketing_ideas")
      .select("id", { count: "exact", head: true })
      .in("estado", ["programada", "publicada"])
      .gte("fecha_programada", lunes)
      .lte("fecha_programada", domingo.toISOString().slice(0, 10)),
    supabase.from("marketing_biblioteca").select("id", { count: "exact", head: true }).eq("archivada", false).eq("identificable", true).eq("autorizacion", "pendiente"),
    supabase.from("marketing_campanas").select("id", { count: "exact", head: true }).eq("estado", "activa"),
  ]);
  const porEstado: Record<string, number> = {};
  for (const i of (ideasRes.data ?? []) as { estado: string }[]) porEstado[i.estado] = (porEstado[i.estado] ?? 0) + 1;
  const enCurso = (porEstado.idea ?? 0) + (porEstado.guion ?? 0) + (porEstado.arte ?? 0);
  const semana = semanaRes.count ?? 0;

  const tarjetas = [
    { href: "/marketing/calendario", icono: "🗓️", nombre: "Calendario de contenido", ayuda: `Esta semana: ${semana} de ${CADENCIA_SEMANAL} programadas o publicadas` },
    { href: "/marketing/ideas", icono: "💡", nombre: "Ideas", ayuda: `${enCurso} en preparación · ${porEstado.aprobada ?? 0} aprobadas · ${porEstado.programada ?? 0} programadas` },
    { href: "/marketing/campanas", icono: "🎯", nombre: "Campañas", ayuda: `${campRes.count ?? 0} activas` },
    { href: "/marketing/biblioteca", icono: "🖼️", nombre: "Biblioteca de fotos", ayuda: `${bibRes.count ?? 0} con autorización del cliente pendiente` },
    { href: "/marketing/cuentas", icono: "🔗", nombre: "Cuentas conectadas", ayuda: "LinkedIn, Instagram y Facebook: en qué estado está cada una." },
    { href: "/marketing/reportes", icono: "📊", nombre: "Reportes", ayuda: "Qué se publicó y cómo le fue." },
  ];

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 space-y-4 p-4 sm:p-6 lg:max-w-6xl">
      <h1 className="text-center text-sm font-bold text-slate-900">Marketing</h1>
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
      <section className="rounded-lg border border-slate-300 bg-white p-4">
        <h2 className="text-sm font-bold text-slate-900">De qué hablar: trabajo real que todavía no tiene contenido</h2>
        <p className="mb-3 text-xs text-slate-600">
          Sale solo de la operación: obras cerradas, visitas con fotos, equipos inspeccionados y formatos firmados. Lo que ya tiene idea no vuelve a salir.
        </p>
        {opRes.error ? (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">No se pudieron leer las oportunidades: {opRes.error.message}</p>
        ) : (
          <Oportunidades oportunidades={(opRes.data ?? []) as Oportunidad[]} escribe={escribe} />
        )}
      </section>
    </div>
  );
}
