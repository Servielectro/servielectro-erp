"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Sede } from "@/lib/clientes-dian";

const CAMPO = "mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-base";

type BorradorSede = { nombre: string; direccion: string; municipio: string; municipio_dane: string; contacto: string; telefono: string; email: string; notas: string };
const vacia: BorradorSede = { nombre: "", direccion: "", municipio: "", municipio_dane: "", contacto: "", telefono: "", email: "", notas: "" };
const deSede = (s: Sede): BorradorSede => ({
  nombre: s.nombre,
  direccion: s.direccion ?? "",
  municipio: s.municipio ?? "",
  municipio_dane: s.municipio_dane ?? "",
  contacto: s.contacto ?? "",
  telefono: s.telefono ?? "",
  email: s.email ?? "",
  notas: s.notas ?? "",
});

/**
 * Sedes del cliente (migración 70): cada una con su dirección, contacto y ubicación. No se
 * borran: se desactivan. La importación de SIIGO nunca las toca.
 */
export function SedesCliente({ clienteId, sedes, edita }: { clienteId: string; sedes: Sede[]; edita: boolean }) {
  const [nueva, setNueva] = useState(false);
  const activas = sedes.filter((s) => s.activa);
  const inactivas = sedes.filter((s) => !s.activa);
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-3 sm:p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-slate-900">Sedes</h2>
        {edita && !nueva && (
          <button type="button" onClick={() => setNueva(true)} className="min-h-11 rounded-md border border-slate-300 px-3 text-sm font-semibold">
            + Agregar sede
          </button>
        )}
      </div>
      <p className="mb-2 text-xs text-slate-500">Para clientes con varias direcciones (bodega, torre 2, sede norte…). La dirección principal sigue en la ficha.</p>
      {nueva && <FormSede clienteId={clienteId} onListo={() => setNueva(false)} />}
      {activas.length === 0 && !nueva && <p className="text-sm text-slate-500">No tiene sedes registradas.</p>}
      <ul className="space-y-2">
        {activas.map((s) => (
          <FilaSede key={s.id} s={s} clienteId={clienteId} edita={edita} />
        ))}
      </ul>
      {inactivas.length > 0 && (
        <details className="mt-2 text-sm">
          <summary className="cursor-pointer text-slate-600">{inactivas.length} desactivada(s)</summary>
          <ul className="mt-2 space-y-2">
            {inactivas.map((s) => (
              <FilaSede key={s.id} s={s} clienteId={clienteId} edita={edita} />
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function FilaSede({ s, clienteId, edita }: { s: Sede; clienteId: string; edita: boolean }) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  if (editando) return <FormSede clienteId={clienteId} sede={s} onListo={() => setEditando(false)} />;

  const actualizar = (cambios: Record<string, unknown>) =>
    empezar(async () => {
      setError(null);
      const { data, error: e } = await createClient().from("cliente_sedes").update(cambios).eq("id", s.id).select("id");
      if (e) return setError(e.message);
      if (!data?.length) return setError("No se guardó: no tienes permiso para editar sedes.");
      router.refresh();
    });

  function tomarUbicacion() {
    setError(null);
    if (!navigator.geolocation) return setError("Este equipo no da la ubicación.");
    navigator.geolocation.getCurrentPosition(
      (p) =>
        actualizar({
          latitud: Number(p.coords.latitude.toFixed(6)),
          longitud: Number(p.coords.longitude.toFixed(6)),
          ubicacion_precision_m: Math.round(p.coords.accuracy * 10) / 10,
          ubicacion_tomada_en: new Date().toISOString(),
        }),
      () => setError("No se pudo tomar la ubicación: revisa que el navegador tenga permiso."),
      { enableHighAccuracy: true, timeout: 20000 },
    );
  }

  return (
    <li className={`rounded-md border border-slate-200 p-3 text-sm ${s.activa ? "" : "opacity-60"}`}>
      <p className="font-semibold text-slate-900">{s.nombre}</p>
      <p className="text-slate-700">{[s.direccion, s.municipio, s.municipio_dane && `DANE ${s.municipio_dane}`].filter(Boolean).join(" · ") || "Sin dirección"}</p>
      {(s.contacto || s.telefono || s.email) && <p className="text-xs text-slate-600">{[s.contacto, s.telefono, s.email].filter(Boolean).join(" · ")}</p>}
      {s.latitud !== null && s.longitud !== null ? (
        <a href={`https://www.google.com/maps?q=${s.latitud},${s.longitud}`} target="_blank" rel="noreferrer" className="text-xs font-semibold text-[#A82323] underline">
          📍 Ver en el mapa
        </a>
      ) : (
        <p className="text-xs text-slate-500">Sin ubicación GPS.</p>
      )}
      {s.notas && <p className="mt-1 text-xs text-slate-600">{s.notas}</p>}
      {edita && (
        <div className="mt-2 flex flex-wrap gap-2">
          {s.activa && (
            <>
              <button type="button" onClick={() => setEditando(true)} className="min-h-11 rounded-md border border-slate-300 px-3 text-xs font-semibold">
                Editar
              </button>
              <button type="button" disabled={pendiente} onClick={tomarUbicacion} className="min-h-11 rounded-md border border-slate-300 px-3 text-xs font-semibold">
                📍 Guardar mi ubicación actual como la de esta sede
              </button>
            </>
          )}
          <button type="button" disabled={pendiente} onClick={() => actualizar({ activa: !s.activa })} className="min-h-11 rounded-md border border-slate-300 px-3 text-xs font-semibold text-slate-600">
            {s.activa ? "Desactivar" : "Volver a activar"}
          </button>
        </div>
      )}
      {error && <p className="mt-1 rounded-md bg-red-50 px-2 py-1 text-xs text-red-800">{error}</p>}
    </li>
  );
}

function FormSede({ clienteId, sede, onListo }: { clienteId: string; sede?: Sede; onListo: () => void }) {
  const router = useRouter();
  const [b, setB] = useState<BorradorSede>(sede ? deSede(sede) : vacia);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  const poner = (k: keyof BorradorSede, v: string) => setB((x) => ({ ...x, [k]: v }));
  const problema = !b.nombre.trim() ? "Ponle un nombre a la sede (ej. Sede norte, Bodega)." : b.municipio_dane.trim() && !/^\d{5}$/.test(b.municipio_dane.trim()) ? "El código DANE son 5 dígitos." : null;

  function guardar() {
    if (problema) return;
    empezar(async () => {
      setError(null);
      const t = (v: string) => v.trim() || null;
      const fila = { nombre: b.nombre.trim(), direccion: t(b.direccion), municipio: t(b.municipio), municipio_dane: t(b.municipio_dane), contacto: t(b.contacto), telefono: t(b.telefono), email: t(b.email), notas: t(b.notas) };
      const supabase = createClient();
      const { data, error: e } = sede
        ? await supabase.from("cliente_sedes").update(fila).eq("id", sede.id).select("id")
        : await supabase.from("cliente_sedes").insert({ ...fila, cliente_id: clienteId }).select("id");
      if (e) return setError(e.message);
      if (!data?.length) return setError("No se guardó: no tienes permiso para editar sedes.");
      onListo();
      router.refresh();
    });
  }

  return (
    <div className="mb-2 space-y-2 rounded-md border border-slate-300 bg-slate-50 p-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block text-sm font-medium sm:col-span-2">
          Nombre de la sede
          <input value={b.nombre} onChange={(e) => poner("nombre", e.target.value)} placeholder="Ej.: Sede norte" className={CAMPO} />
        </label>
        <label className="block text-sm font-medium sm:col-span-2">
          Dirección
          <input value={b.direccion} onChange={(e) => poner("direccion", e.target.value)} className={CAMPO} />
        </label>
        <label className="block text-sm font-medium">
          Municipio
          <input value={b.municipio} onChange={(e) => poner("municipio", e.target.value)} className={CAMPO} />
        </label>
        <label className="block text-sm font-medium">
          Código DANE
          <input value={b.municipio_dane} onChange={(e) => poner("municipio_dane", e.target.value)} inputMode="numeric" maxLength={5} className={CAMPO} />
        </label>
        <label className="block text-sm font-medium">
          Contacto en la sede
          <input value={b.contacto} onChange={(e) => poner("contacto", e.target.value)} className={CAMPO} />
        </label>
        <label className="block text-sm font-medium">
          Teléfono
          <input value={b.telefono} onChange={(e) => poner("telefono", e.target.value)} inputMode="tel" className={CAMPO} />
        </label>
        <label className="block text-sm font-medium sm:col-span-2">
          Correo
          <input type="email" value={b.email} onChange={(e) => poner("email", e.target.value)} className={CAMPO} />
        </label>
        <label className="block text-sm font-medium sm:col-span-2">
          Notas
          <input value={b.notas} onChange={(e) => poner("notas", e.target.value)} placeholder="Horario, portería, parqueadero…" className={CAMPO} />
        </label>
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={onListo} className="min-h-11 flex-1 rounded-md border border-slate-300 text-sm font-semibold">
          Cancelar
        </button>
        <button type="button" disabled={pendiente || !!problema} onClick={guardar} className="min-h-11 flex-1 rounded-md bg-slate-900 text-sm font-semibold text-white disabled:opacity-40">
          {pendiente ? "Guardando…" : sede ? "Guardar sede" : "Agregar sede"}
        </button>
      </div>
      {problema && <p className="text-xs text-slate-600">{problema}</p>}
      {error && <p className="rounded-md bg-red-50 px-2 py-1 text-xs text-red-800">{error}</p>}
    </div>
  );
}
