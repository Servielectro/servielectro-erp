import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { seccionesOcultas } from "@/lib/permisos";

// Licitaciones (migración 143): el radar de SECOP II. Las secciones están en modulo_secciones; cada
// rol ve las suyas. «En seguimiento» todavía no tiene pantalla: no se muestra hasta que exista.
export default async function LicitacionesPage() {
  const supabase = await createClient();
  const [relevantes, sinRup, ultimo, secciones] = await Promise.all([
    supabase.from("v_licitaciones_radar").select("id", { count: "exact", head: true }).eq("relevante", true),
    supabase.from("v_licitaciones_radar").select("id", { count: "exact", head: true }).eq("relevante", true).eq("requiere_rup", false),
    supabase.from("licitacion_barridos").select("iniciado_en, error").order("iniciado_en", { ascending: false }).limit(1),
    seccionesOcultas(),
  ]);
  const ocultas = new Set(secciones.ocultas);
  const b = (ultimo.data?.[0] ?? null) as { iniciado_en: string; error: string | null } | null;
  const tarjetas = [
    {
      href: "/licitaciones/oportunidades", icono: "📡", nombre: "Oportunidades",
      ayuda: `${relevantes.count ?? 0} relevantes abiertas · ${sinRup.count ?? 0} sin RUP`,
    },
    { href: "/licitaciones/criterios", icono: "🎯", nombre: "Qué estamos buscando", ayuda: "Palabras, códigos, ciudades y modalidades del radar." },
    {
      href: "/licitaciones/barridos", icono: "🔁", nombre: "Historial de búsqueda",
      ayuda: b
        ? `Último: ${new Date(b.iniciado_en).toLocaleString("es-CO", { timeZone: "America/Bogota", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}${b.error ? " · con error" : ""}`
        : "Todavía no ha corrido ninguna búsqueda.",
    },
  ].filter((t) => !ocultas.has(t.href));
  return (
    <div className="mx-auto w-full max-w-3xl flex-1 p-4 sm:p-6 lg:max-w-6xl">
      <h1 className="mb-4 text-center text-sm font-bold text-slate-900">Licitaciones</h1>
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
