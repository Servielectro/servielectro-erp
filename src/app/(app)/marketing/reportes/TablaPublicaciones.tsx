"use client";

import Link from "next/link";
import { ETIQUETA_CANAL, ETIQUETA_TIPO, fechaCorta } from "@/lib/marketing";
import { Mediciones, type Medicion } from "../Mediciones";

export type { Medicion };
export interface FilaPublicacion {
  id: string;
  publicado_en: string;
  url: string | null;
  ideaId: string | null;
  titulo: string;
  tipo: string;
  canal: string;
  cuenta: string;
  serie: string | null;
  mediciones: Medicion[];
  ultima: Medicion | null;
}

export function TablaPublicaciones({ escribe, publicaciones }: { escribe: boolean; publicaciones: FilaPublicacion[] }) {
  return (
    <section className="rounded-lg border border-slate-300 bg-white p-3">
      <h2 className="text-sm font-bold text-slate-900">Publicaciones</h2>
      <p className="mb-2 text-xs text-slate-600">Los números se copian de cada red. Cada medición queda con su fecha: mídela a los 7 y a los 30 días para ver cómo se mueve.</p>
      {publicaciones.length === 0 ? (
        <p className="py-4 text-center text-sm text-slate-500">Todavía no se ha registrado ninguna publicación. Se registran desde la ficha de cada idea.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {publicaciones.map((p) => (
            <li key={p.id} className="space-y-2 py-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  {p.ideaId ? (
                    <Link href={`/marketing/ideas/${p.ideaId}`} className="hover:underline">
                      {p.titulo}
                    </Link>
                  ) : (
                    p.titulo
                  )}
                </p>
                <p className="text-xs text-slate-600">
                  {[ETIQUETA_CANAL[p.canal] ?? p.canal, p.serie ?? ETIQUETA_TIPO[p.tipo] ?? p.tipo, fechaCorta(p.publicado_en)].join(" · ")}
                  {p.url && (
                    <>
                      {" · "}
                      <a href={p.url} target="_blank" rel="noreferrer" className="underline">
                        ver
                      </a>
                    </>
                  )}
                </p>
              </div>
              <Mediciones publicacionId={p.id} publicadoEn={p.publicado_en} mediciones={p.mediciones} escribe={escribe} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
