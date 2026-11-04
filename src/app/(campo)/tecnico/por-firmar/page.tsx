import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PantallaPerfil } from "@/components/rrhh/PantallaPerfil";
import { COLUMNAS_POR_FIRMAR, type PorFirmar } from "@/lib/sst/por-firmar";

// Bandeja del técnico (migración 131): los formatos a los que lo convocaron, mientras estén en
// borrador. No pide permiso de SG-SST: la vista y las políticas de la 131 dejan ver solo ESOS.
export default async function PorFirmarPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/tecnico/por-firmar");

  const { data, error } = await supabase.from("v_mis_documentos_por_firmar").select(COLUMNAS_POR_FIRMAR).order("fecha");
  const filas = (data ?? []) as PorFirmar[];
  const pendientes = filas.filter((f) => !f.ya_firme);
  const firmados = filas.filter((f) => f.ya_firme);

  return (
    <PantallaPerfil titulo="Documentos por firmar" ayuda="Capacitaciones y formatos a los que te convocaron. Entra, lee el material y firma.">
      {error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">No se pudo leer tu bandeja: {error.message}</p>
      ) : (
        <div className="space-y-4">
          {pendientes.length > 0 ? (
            <p className="rounded-lg border-2 border-amber-500 bg-amber-50 px-3 py-2 text-base font-bold text-amber-900">
              {pendientes.length === 1 ? "Tienes 1 documento pendiente de firmar" : `Tienes ${pendientes.length} documentos pendientes de firmar`}
            </p>
          ) : (
            <p className="rounded-lg bg-white px-3 py-3 text-base text-slate-700">No tienes nada pendiente de firmar.</p>
          )}
          <ul className="space-y-2">
            {pendientes.map((f) => (
              <Fila key={f.formato_id} f={f} />
            ))}
          </ul>
          {firmados.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Ya firmaste (falta que los cierren)</h2>
              <ul className="space-y-2">
                {firmados.map((f) => (
                  <Fila key={f.formato_id} f={f} />
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </PantallaPerfil>
  );
}

function Fila({ f }: { f: PorFirmar }) {
  return (
    <li>
      <Link
        href={`/tecnico/por-firmar/${f.formato_id}`}
        className={`flex min-h-14 items-center justify-between gap-2 rounded-xl border bg-white px-3 py-2 active:bg-slate-50 ${f.ya_firme ? "border-slate-300" : "border-amber-500"}`}
      >
        <span className="min-w-0">
          <span className="block font-semibold text-slate-900">{f.tema || f.formato}</span>
          <span className="block text-sm text-slate-600">
            {f.codigo} · {f.fecha}
            {f.lugar ? ` · ${f.lugar}` : ""}
          </span>
          <span className={`block text-sm font-semibold ${f.ya_firme ? "text-green-700" : "text-amber-800"}`}>{f.ya_firme ? "✓ Firmaste" : "Pendiente: leer y firmar"}</span>
        </span>
        <span className="text-lg" aria-hidden>
          →
        </span>
      </Link>
    </li>
  );
}
