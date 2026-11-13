import Link from "next/link";
import { formatCOP } from "@/lib/pricing";

/** Una fila de v_marketing_retorno (migración 151): una publicación y lo que trajo. */
export interface FilaRetorno {
  publicacion_id: string;
  idea_id: string;
  titulo: string;
  serie: string | null;
  guardados: number | null;
  comentarios: number | null;
  oportunidades: number;
  con_cotizacion: number;
  valor_estimado: number;
  ganadas: number;
  valor_ganado: number;
}

interface Suma {
  nombre: string;
  ideaId: string | null;
  guardados: number;
  comentarios: number;
  oportunidades: number;
  con_cotizacion: number;
  valor_estimado: number;
  ganadas: number;
  valor_ganado: number;
}

function agrupar(filas: FilaRetorno[], clave: (f: FilaRetorno) => string, nombre: (f: FilaRetorno) => string, ideaId: (f: FilaRetorno) => string | null): Suma[] {
  const g = new Map<string, Suma>();
  for (const f of filas) {
    const k = clave(f);
    const x = g.get(k) ?? { nombre: nombre(f), ideaId: ideaId(f), guardados: 0, comentarios: 0, oportunidades: 0, con_cotizacion: 0, valor_estimado: 0, ganadas: 0, valor_ganado: 0 };
    x.guardados += Number(f.guardados ?? 0);
    x.comentarios += Number(f.comentarios ?? 0);
    x.oportunidades += Number(f.oportunidades);
    x.con_cotizacion += Number(f.con_cotizacion);
    x.valor_estimado += Number(f.valor_estimado);
    x.ganadas += Number(f.ganadas);
    x.valor_ganado += Number(f.valor_ganado);
    g.set(k, x);
  }
  return [...g.values()].sort((a, b) => b.valor_ganado - a.valor_ganado || b.oportunidades - a.oportunidades || b.guardados + b.comentarios - (a.guardados + a.comentarios));
}

function Lista({ titulo, filas }: { titulo: string; filas: Suma[] }) {
  return (
    <div>
      <h3 className="mb-1 text-sm font-semibold text-slate-800">{titulo}</h3>
      <ul className="divide-y divide-slate-100">
        {filas.map((f) => (
          <li key={f.ideaId ?? f.nombre} className="py-1.5">
            <p className="text-sm font-semibold text-slate-900">
              {f.ideaId ? (
                <Link href={`/marketing/ideas/${f.ideaId}`} className="hover:underline">
                  {f.nombre}
                </Link>
              ) : (
                f.nombre
              )}
            </p>
            <p className="text-xs text-slate-700">
              {f.oportunidades > 0 ? (
                <>
                  <b>{f.oportunidades}</b> oportunidad{f.oportunidades === 1 ? "" : "es"} · {f.con_cotizacion} con cotización · {formatCOP(f.valor_estimado)} en juego · <b>{f.ganadas}</b> ganada{f.ganadas === 1 ? "" : "s"} por <b>{formatCOP(f.valor_ganado)}</b>
                </>
              ) : (
                "Sin negocios vinculados"
              )}{" "}
              · {f.guardados} guardados · {f.comentarios} comentarios
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Qué contenido trae negocio. Cuenta solo los negocios que alguien ató a una publicación en el CRM. */
export function Retorno({ veComercial, filas, error }: { veComercial: boolean; filas: FilaRetorno[]; error: string | null }) {
  // Sin migración, o sin permiso de Comercial, las cuentas darían cero y parecería que nada vendió.
  if (error || !veComercial) return null;
  return (
    <section className="space-y-3 rounded-lg border border-slate-300 bg-white p-3">
      <div>
        <h2 className="text-sm font-bold text-slate-900">Qué contenido trae negocio</h2>
        <p className="text-xs text-slate-600">Cuenta los negocios del CRM con origen «redes sociales» atados a una publicación. Los que no se ataron no aparecen aquí.</p>
      </div>
      {filas.length === 0 ? (
        <p className="py-2 text-center text-sm text-slate-500">Todavía no hay publicaciones registradas.</p>
      ) : (
        <div className="space-y-3 lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0">
          <Lista titulo="Por serie" filas={agrupar(filas, (f) => f.serie ?? "Sin serie", (f) => f.serie ?? "Sin serie", () => null)} />
          <Lista titulo="Por pieza" filas={agrupar(filas, (f) => f.idea_id, (f) => f.titulo, (f) => f.idea_id)} />
        </div>
      )}
    </section>
  );
}
