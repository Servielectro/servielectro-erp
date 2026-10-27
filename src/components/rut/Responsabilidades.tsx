"use client";

import { useEffect, useState } from "react";
import { cargarResponsabilidades, describirResponsabilidad, type Responsabilidad } from "@/lib/rut/catalogos";

/** Sugerencia de IVA o renta según los códigos del RUT y el catálogo (migración 80). */
export function sugerenciaPorCodigos(
  codigos: string[],
  catalogo: Responsabilidad[],
  campo: "sugiere_responsable_iva" | "sugiere_declarante_renta",
): { valor: boolean; porque: string } | null {
  const marcas = codigos.map((c) => catalogo.find((x) => x.sistema === "rut" && x.codigo === c)).filter((x): x is Responsabilidad => !!x && x[campo] !== null);
  if (!marcas.length || new Set(marcas.map((m) => m[campo])).size > 1) return null;
  return { valor: marcas[0][campo] as boolean, porque: `por el código ${marcas.map((m) => `${m.codigo} (${m.nombre})`).join(", ")} del RUT` };
}

export function useCatalogoResponsabilidades() {
  const [catalogo, setCatalogo] = useState<Responsabilidad[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    cargarResponsabilidades().then(setCatalogo, (e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);
  return { catalogo, error };
}

/**
 * Las dos codificaciones de la DIAN, cada una en su sitio (migración 80):
 *   - Factura electrónica (O-13 … R-99-PN): lo que va en la factura. Casillas.
 *   - RUT casilla 53 (códigos numéricos): lo que dice el RUT del cliente. Arriba las que afectan
 *     la facturación; el resto desplegable. Lo que no esté en el catálogo se ve como
 *     "código XX — sin descripción", nunca escondido.
 */
export function ResponsabilidadesCliente({
  rut,
  fe,
  onCambio,
  deshabilitado,
  catalogo,
}: {
  rut: string[];
  fe: string[];
  onCambio: (v: { rut: string[]; fe: string[] }) => void;
  deshabilitado?: boolean;
  catalogo: Responsabilidad[];
}) {
  const [agregar, setAgregar] = useState("");
  const catFe = catalogo.filter((c) => c.sistema === "fe" && c.activa);
  const catRut = catalogo.filter((c) => c.sistema === "rut");
  const afecta = (c: string) => catRut.find((x) => x.codigo === c)?.afecta_facturacion ?? false;
  const enCatalogo = (c: string) => catRut.some((x) => x.codigo === c);
  const arriba = rut.filter((c) => afecta(c) || !enCatalogo(c));
  const resto = rut.filter((c) => !afecta(c) && enCatalogo(c));
  const quitar = (c: string) => onCambio({ rut: rut.filter((x) => x !== c), fe });

  const fila = (c: string) => (
    <li key={c} className="flex min-h-11 items-center justify-between gap-2 border-b border-slate-100 text-sm">
      <span className={enCatalogo(c) ? "text-slate-800" : "font-semibold text-amber-800"}>{describirResponsabilidad(c, catalogo)}</span>
      {!deshabilitado && (
        <button type="button" onClick={() => quitar(c)} className="min-h-11 shrink-0 px-2 text-xs text-slate-500 underline">
          Quitar
        </button>
      )}
    </li>
  );

  return (
    <div className="space-y-3">
      <fieldset>
        <legend className="text-sm font-medium text-slate-800">Para la factura electrónica</legend>
        <p className="text-xs text-slate-500">Códigos del anexo técnico de la DIAN. Mínimo R-99-PN.</p>
        <div className="mt-1 grid gap-1 sm:grid-cols-2">
          {catFe.map((r) => (
            <label key={r.codigo} className="flex min-h-11 items-center gap-2 text-sm">
              <input
                type="checkbox"
                disabled={deshabilitado}
                checked={fe.includes(r.codigo)}
                onChange={(e) => onCambio({ rut, fe: e.target.checked ? [...fe, r.codigo] : fe.filter((x) => x !== r.codigo) })}
                className="h-5 w-5"
              />
              {r.codigo} {r.nombre}
            </label>
          ))}
          {!catFe.length && <p className="text-sm text-slate-500">Cargando el catálogo…</p>}
        </div>
      </fieldset>

      <div>
        <p className="text-sm font-medium text-slate-800">Del RUT (casilla 53)</p>
        {rut.length === 0 ? (
          <p className="text-sm text-slate-500">Sin responsabilidades registradas. Se llenan al leer el RUT.</p>
        ) : (
          <>
            {arriba.length > 0 && <ul>{arriba.map(fila)}</ul>}
            {resto.length > 0 && (
              <details className="mt-1">
                <summary className="min-h-11 cursor-pointer py-2 text-sm text-slate-600">
                  {resto.length} más que no cambian la facturación
                </summary>
                <ul>{resto.map(fila)}</ul>
              </details>
            )}
          </>
        )}
        {!deshabilitado && catRut.length > 0 && (
          <div className="mt-2 flex gap-2">
            <select value={agregar} onChange={(e) => setAgregar(e.target.value)} className="min-w-0 flex-1 rounded-md border border-slate-300 px-2 py-2 text-sm">
              <option value="">Agregar un código del RUT…</option>
              {catRut
                .filter((x) => !rut.includes(x.codigo))
                .map((x) => (
                  <option key={x.codigo} value={x.codigo}>
                    {x.codigo} — {x.nombre}
                  </option>
                ))}
            </select>
            <button
              type="button"
              disabled={!agregar}
              onClick={() => {
                onCambio({ rut: [...rut, agregar], fe });
                setAgregar("");
              }}
              className="min-h-11 shrink-0 rounded-md border border-slate-400 px-3 text-sm disabled:opacity-40"
            >
              Agregar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
