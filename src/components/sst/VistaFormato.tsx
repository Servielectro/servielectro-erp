import { FormularioSst } from "@/components/sst/FormularioSst";
import { fechaHora, type FormatoCompleto } from "@/lib/sst/formato-servidor";
import { ESTADO_FORMATO } from "@/lib/sst/plantillas";

const ROL: Record<string, string> = { tecnico: "Técnico", responsable_sst: "Responsable en sitio", sst_cliente: "SST del cliente", otro: "Otro" };

/** El formato completo, de solo lectura: contenido, firmas con su registro y el sello. */
export function VistaFormato({ f, imprimir }: { f: FormatoCompleto; imprimir?: boolean }) {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs text-slate-500">
          {f.plantilla.codigo} · versión {f.plantilla.version}
        </p>
        <h1 className="text-lg font-bold text-slate-900">{f.plantilla.nombre}</h1>
        <p className="text-sm text-slate-700">
          {f.fecha} · {f.proyecto ?? "Sin obra"}
          {f.lugar ? ` · ${f.lugar}` : ""}
        </p>
        <p className="text-xs text-slate-500">
          Llenado por {f.creado_por_nombre ?? "—"} · {ESTADO_FORMATO[f.estado]}
        </p>
      </div>

      <Sello f={f} />

      <section className={imprimir ? "" : "rounded-lg border border-slate-200 bg-white p-3"}>
        <FormularioSst campos={f.plantilla.campos} respuestas={f.respuestas} archivos={f.archivos} />
      </section>

      <section className={imprimir ? "break-inside-avoid" : "rounded-lg border border-slate-200 bg-white p-3"}>
        <h2 className="mb-2 text-base font-bold">Firmas</h2>
        {f.firmas.length === 0 ? (
          <p className="text-sm text-slate-500">Sin firmas todavía.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {f.firmas.map((x) => (
              <div key={x.id} className="break-inside-avoid rounded-md border border-slate-200 p-2 text-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{ROL[x.rol] ?? x.rol}</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {x.url ? <img src={x.url} alt={`Firma de ${x.nombre}`} className="my-1 h-20 w-full object-contain" /> : <p className="my-1 text-xs text-slate-500">(imagen no disponible)</p>}
                <p className="font-semibold">{x.nombre}</p>
                <p>
                  CC {x.documento}
                  {x.cargo ? ` · ${x.cargo}` : ""}
                  {x.empresa ? ` · ${x.empresa}` : ""}
                </p>
                <p className="mt-1 text-xs text-slate-600">
                  Firmó: {fechaHora(x.firmada_en_dispositivo)} (en el dispositivo) · recibida {fechaHora(x.recibida_en)}
                </p>
                <p className="text-xs text-slate-600">Registrada por {x.registrada_por_nombre ?? "—"}</p>
                {x.lat !== null && x.lng !== null ? (
                  <p className="text-xs text-slate-600">
                    GPS {Number(x.lat).toFixed(5)}, {Number(x.lng).toFixed(5)}
                  </p>
                ) : (
                  <p className="text-xs text-slate-600">GPS: {x.gps_estado?.replace("_", " ") ?? "—"}</p>
                )}
                {x.dispositivo && <p className="truncate text-xs text-slate-400">Equipo: {x.dispositivo}</p>}
                <p className="truncate font-mono text-[10px] text-slate-400">Contenido firmado: {x.hash_contenido}</p>
              </div>
            ))}
          </div>
        )}
      </section>
      <p className="text-xs text-slate-500">
        Firma manuscrita digitalizada con registro íntegro (quién, cuándo, dónde, desde qué equipo y la huella del contenido). No es firma digital con certificado (Ley 527 de 1999).
      </p>
    </div>
  );
}

function Sello({ f }: { f: FormatoCompleto }) {
  if (f.estado === "anulado") {
    return <p className="rounded-lg border border-slate-400 bg-slate-100 px-3 py-2 text-sm text-slate-800">Anulado el {fechaHora(f.anulado_en)}: {f.motivo_anulacion}</p>;
  }
  if (f.integro === null) {
    return <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">Todavía no está cerrado: falta firmar o cerrarlo. Al cerrarlo queda sellado.</p>;
  }
  return f.integro ? (
    <div className="rounded-lg border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-900">
      <p className="font-semibold">✓ Documento íntegro</p>
      <p>
        Sellado el {fechaHora(f.sellado_en)}. Lo que se ve es exactamente lo que se firmó: la base volvió a calcular la huella del contenido y coincide con la de cada firma.
        {f.aprobado_en ? ` Aprobado por ${f.aprobado_por_nombre ?? "—"} el ${fechaHora(f.aprobado_en)}.` : ""}
      </p>
      <p className="truncate font-mono text-[10px]">Huella: {f.hash_contenido}</p>
    </div>
  ) : (
    <div className="rounded-lg border border-red-400 bg-red-50 px-3 py-2 text-sm text-red-900">
      <p className="font-semibold">✗ El contenido NO coincide con lo que se firmó</p>
      <p>Alguien lo cambió por fuera del ERP después del sello. Este documento no sirve como evidencia tal como está: avisa a la gestión SST.</p>
    </div>
  );
}
