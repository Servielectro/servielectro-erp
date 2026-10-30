import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { tienePermiso } from "@/lib/permisos";
import { CADENCIA_SEMANAL, ETIQUETA_CANAL, ETIQUETA_TIPO, hoyBogota } from "@/lib/marketing";
import { TablaPublicaciones, type FilaPublicacion, type Medicion } from "./TablaPublicaciones";

interface PubCruda {
  id: string;
  publicado_en: string;
  url: string | null;
  marketing_ideas: { id: string; titulo: string; tipo: string } | null;
  marketing_cuentas: { canal: string; nombre: string } | null;
}

const lunesDe = (d: Date) => {
  const x = new Date(d);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x.toISOString().slice(0, 10);
};
const n = (v: number | null | undefined) => v ?? 0;
const miles = (v: number) => v.toLocaleString("es-CO");

interface Grupo {
  publicaciones: number;
  medidas: number;
  alcance: number;
  interacciones: number;
  clics: number;
}

/**
 * Reportes de Marketing (migración 125). Los números se cargan a mano mientras no esté la fase 3
 * (cada medición es una foto del día: se toma la última de cada publicación).
 */
export default async function ReportesPage() {
  const supabase = await createClient();
  const [escribe, pubRes, metRes] = await Promise.all([
    tienePermiso("marketing", "trabajar"),
    supabase.from("marketing_publicaciones").select("id, publicado_en, url, marketing_ideas(id, titulo, tipo), marketing_cuentas(canal, nombre)").order("publicado_en", { ascending: false }).limit(500),
    supabase.from("marketing_metricas").select("publicacion_id, medida_en, alcance, impresiones, interacciones, clics, guardados, comentarios").order("medida_en", { ascending: false }),
  ]);
  const ultima = new Map<string, Medicion>();
  for (const m of (metRes.data ?? []) as (Medicion & { publicacion_id: string })[]) if (!ultima.has(m.publicacion_id)) ultima.set(m.publicacion_id, m);
  const pubs: FilaPublicacion[] = ((pubRes.data ?? []) as unknown as PubCruda[]).map((p) => ({
    id: p.id,
    publicado_en: p.publicado_en,
    url: p.url,
    ideaId: p.marketing_ideas?.id ?? null,
    titulo: p.marketing_ideas?.titulo ?? "—",
    tipo: p.marketing_ideas?.tipo ?? "",
    canal: p.marketing_cuentas?.canal ?? "",
    cuenta: p.marketing_cuentas?.nombre ?? "",
    ultima: ultima.get(p.id) ?? null,
  }));

  // Totales con la última medición de cada publicación.
  const agrupar = (clave: (p: FilaPublicacion) => string) => {
    const g = new Map<string, Grupo>();
    for (const p of pubs) {
      const k = clave(p);
      const x = g.get(k) ?? { publicaciones: 0, medidas: 0, alcance: 0, interacciones: 0, clics: 0 };
      x.publicaciones++;
      if (p.ultima) {
        x.medidas++;
        x.alcance += n(p.ultima.alcance);
        x.interacciones += n(p.ultima.interacciones);
        x.clics += n(p.ultima.clics);
      }
      g.set(k, x);
    }
    return [...g.entries()].sort((a, b) => b[1].alcance - a[1].alcance);
  };

  // Cadencia de las últimas 8 semanas.
  const hoy = new Date(`${hoyBogota()}T12:00:00`);
  const semanas: { lunes: string; total: number }[] = [];
  for (let i = 7; i >= 0; i--) {
    const d = new Date(hoy);
    d.setDate(d.getDate() - i * 7);
    semanas.push({ lunes: lunesDe(d), total: 0 });
  }
  // Una idea publicada en tres cuentas cuenta una vez por semana: la cadencia es de contenido.
  const vistas = new Set<string>();
  for (const p of pubs) {
    const l = lunesDe(new Date(p.publicado_en));
    const s = semanas.find((x) => x.lunes === l);
    if (s && !vistas.has(`${l}-${p.ideaId}`)) {
      vistas.add(`${l}-${p.ideaId}`);
      s.total++;
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 space-y-3 p-4 sm:p-6 lg:max-w-6xl">
      <Link href="/marketing" className="text-sm text-slate-600 underline">
        ← Marketing
      </Link>
      <h1 className="text-lg font-bold text-slate-900">Reportes</h1>
      {pubRes.error && <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">No se pudieron leer las publicaciones: {pubRes.error.message}</p>}
      <section className="rounded-lg border border-slate-300 bg-white p-3">
        <h2 className="text-sm font-bold text-slate-900">Cadencia: contenido publicado por semana (meta {CADENCIA_SEMANAL})</h2>
        <div className="mt-2 flex items-end gap-1.5" role="img" aria-label="Publicaciones por semana en las últimas 8 semanas">
          {semanas.map((s) => (
            <div key={s.lunes} className="flex flex-1 flex-col items-center gap-1">
              <span className="text-xs font-semibold text-slate-700">{s.total}</span>
              <div className={`w-full rounded-t ${s.total >= CADENCIA_SEMANAL ? "bg-green-600" : s.total > 0 ? "bg-amber-400" : "bg-slate-200"}`} style={{ height: `${Math.max(4, Math.min(s.total, CADENCIA_SEMANAL + 2) * 14)}px` }} />
              <span className="text-[10px] text-slate-500">{new Date(`${s.lunes}T12:00:00`).toLocaleDateString("es-CO", { day: "numeric", month: "short" })}</span>
            </div>
          ))}
        </div>
      </section>
      <div className="space-y-3 lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0">
        <Tabla titulo="Por canal" filas={agrupar((p) => p.canal)} etiqueta={(k) => ETIQUETA_CANAL[k] ?? k} />
        <Tabla titulo="Por tipo de contenido" filas={agrupar((p) => p.tipo)} etiqueta={(k) => ETIQUETA_TIPO[k] ?? k} />
      </div>
      <TablaPublicaciones escribe={escribe} publicaciones={pubs} />
    </div>
  );
}

function Tabla({ titulo, filas, etiqueta }: { titulo: string; filas: [string, Grupo][]; etiqueta: (k: string) => string }) {
  return (
    <section className="rounded-lg border border-slate-300 bg-white p-3">
      <h2 className="mb-2 text-sm font-bold text-slate-900">{titulo}</h2>
      {filas.length === 0 ? (
        <p className="text-sm text-slate-500">Sin publicaciones.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-slate-500">
            <tr>
              <th className="py-1 font-semibold" />
              <th className="py-1 text-right font-semibold">Publ.</th>
              <th className="py-1 text-right font-semibold">Alcance</th>
              <th className="py-1 text-right font-semibold">Interacc.</th>
              <th className="py-1 text-right font-semibold">Tasa</th>
            </tr>
          </thead>
          <tbody>
            {filas.map(([k, x]) => (
              <tr key={k} className="border-t border-slate-100">
                <td className="py-1.5">{etiqueta(k)}</td>
                <td className="py-1.5 text-right">
                  {x.publicaciones}
                  {x.medidas < x.publicaciones && <span className="text-xs text-amber-700"> ({x.publicaciones - x.medidas} sin medir)</span>}
                </td>
                <td className="py-1.5 text-right">{miles(x.alcance)}</td>
                <td className="py-1.5 text-right">{miles(x.interacciones)}</td>
                <td className="py-1.5 text-right">{x.alcance ? `${((x.interacciones / x.alcance) * 100).toFixed(1)}%` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
