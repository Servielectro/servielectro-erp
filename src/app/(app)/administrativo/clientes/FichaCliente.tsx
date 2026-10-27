"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { dvNit, faltanParaFacturar, nitBase, TIPOS_DOCUMENTO_DIAN, type ClienteFicha, type TipoPersona } from "@/lib/clientes-dian";
import { LectorRut } from "@/components/rut/LectorRut";
import { SelectorMunicipio } from "@/components/rut/SelectorMunicipio";
import { ResponsabilidadesCliente, sugerenciaPorCodigos, useCatalogoResponsabilidades } from "@/components/rut/Responsabilidades";
import { cargarMunicipios } from "@/lib/rut/catalogos";
import { armarPropuesta, type PropuestaRut } from "@/lib/rut/propuesta";
import type { RutLeido } from "@/lib/rut/useLecturaRut";

const CAMPO = "mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-base disabled:bg-slate-50 disabled:text-slate-700";
const ETIQUETA = "block text-sm font-medium text-slate-800";
const AYUDA = "mt-0.5 block text-xs font-normal text-slate-500";

type Borrador = {
  nombre: string;
  tipo_documento: string;
  nit: string;
  dv: string;
  tipo_persona: "" | TipoPersona;
  email: string;
  email_encargado_proyecto: string;
  contacto: string;
  telefono: string;
  direccion: string;
  municipio: string;
  departamento: string;
  municipio_dane: string;
  responsable_iva: "" | "si" | "no";
  declarante_renta: "" | "si" | "no";
  responsabilidades_rut: string[];
  responsabilidades_fe: string[];
  notas: string;
};

function borradorDe(c: ClienteFicha | null): Borrador {
  const sn = (v: boolean | null | undefined) => (v === true ? "si" : v === false ? "no" : "");
  return {
    nombre: c?.nombre ?? "",
    tipo_documento: c?.tipo_documento ?? "",
    nit: c?.nit ?? "",
    dv: c?.dv ?? "",
    tipo_persona: c?.tipo_persona ?? (c?.tipo_contribuyente === "NATURAL" ? "natural" : c?.tipo_contribuyente === "JURIDICA" ? "juridica" : ""),
    email: c?.email ?? "",
    email_encargado_proyecto: c?.email_encargado_proyecto ?? "",
    contacto: c?.contacto ?? "",
    telefono: c?.telefono ?? "",
    direccion: c?.direccion ?? "",
    municipio: c?.municipio ?? "",
    departamento: c?.departamento ?? "",
    municipio_dane: c?.municipio_dane ?? "",
    responsable_iva: sn(c?.responsable_iva),
    declarante_renta: sn(c?.declarante_renta),
    responsabilidades_rut: c?.responsabilidades_rut ?? [],
    responsabilidades_fe: c?.responsabilidades_fe ?? [],
    notas: c?.notas ?? "",
  };
}

/** Lo que la base va a decir, dicho antes de guardar (la regla de verdad está en la base). */
function problemas(b: Borrador): string | null {
  if (!b.nombre.trim()) return "Falta el nombre o razón social.";
  if (b.tipo_documento === "31" && b.nit.trim()) {
    const base = nitBase(b.nit);
    const pegado = b.nit.includes("-") ? b.nit.split("-")[1]?.trim() : "";
    const dv = b.dv.trim() || pegado;
    if (base && dv && dv !== dvNit(base)) return `El DV ${dv} no corresponde al NIT ${base} (debería ser ${dvNit(base)}). Revisa el NIT o el DV.`;
  }
  if (b.dv.trim() && !/^\d$/.test(b.dv.trim())) return "El DV es un solo dígito.";
  if (b.municipio_dane.trim() && !/^\d{5}$/.test(b.municipio_dane.trim())) return "El código DANE son 5 dígitos (ej. 11001 Bogotá, 05001 Medellín).";
  return null;
}

function mensajeBase(m: string): string {
  if (/uq_clientes_nit_base|duplicate key/.test(m)) return "Ya hay un cliente con ese NIT. Búscalo en la lista: no se crean dos fichas para el mismo NIT.";
  return m;
}

export function FichaCliente({ cliente, edita }: { cliente: ClienteFicha | null; edita: boolean }) {
  const router = useRouter();
  const [b, setB] = useState<Borrador>(() => borradorDe(cliente));
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  const { catalogo } = useCatalogoResponsabilidades();
  // Lo leído del RUT: propuesta que se confirma al guardar. `antes` permite deshacerlo.
  const [rut, setRut] = useState<{ leido: RutLeido; propuesta: PropuestaRut; antes: Borrador; llenados: string[] } | null>(null);
  const [avisoRut, setAvisoRut] = useState<string | null>(null);
  const poner = <K extends keyof Borrador>(k: K, v: Borrador[K]) => {
    setAviso(null);
    setB((x) => ({ ...x, [k]: v }));
  };
  const problema = problemas(b);
  const cambio = JSON.stringify(b) !== JSON.stringify(borradorDe(cliente));
  const esNit = b.tipo_documento === "31";
  const dvCalculado = esNit ? dvNit(b.nit) : null;
  const falta = faltanParaFacturar({
    nit: b.nit || null,
    tipo_documento: b.tipo_documento || null,
    email: b.email || null,
    municipio_dane: b.municipio_dane || null,
    responsabilidades_fe: b.responsabilidades_fe,
  });
  const sugIva = sugerenciaPorCodigos(b.responsabilidades_rut, catalogo, "sugiere_responsable_iva") ?? rut?.propuesta.responsable_iva ?? null;
  const sugRenta = sugerenciaPorCodigos(b.responsabilidades_rut, catalogo, "sugiere_declarante_renta");

  async function aplicarRut(leido: RutLeido) {
    setAvisoRut(null);
    if (!leido.resultado.extraccion.es_documento_rut) {
      setAvisoRut(`Ese archivo no parece un RUT${leido.resultado.extraccion.tipo_documento_detectado ? ` (parece: ${leido.resultado.extraccion.tipo_documento_detectado})` : ""}. No se cambió nada.`);
      return;
    }
    let municipios: Awaited<ReturnType<typeof cargarMunicipios>> = [];
    try {
      municipios = await cargarMunicipios();
    } catch {
      // sin la tabla, el municipio queda escrito y el código se elige a mano
    }
    const pr = armarPropuesta(leido.resultado, municipios, catalogo);
    const antes = b;
    const nuevo: Borrador = { ...b };
    const llenados: string[] = [];
    const llenar = <K extends keyof Borrador>(k: K, v: Borrador[K], nombre: string) => {
      if (Array.isArray(v) ? !v.length : !v) return;
      if (JSON.stringify(nuevo[k]) !== JSON.stringify(v)) llenados.push(nombre);
      nuevo[k] = v;
    };
    llenar("nombre", pr.nombre, "nombre");
    llenar("tipo_documento", pr.tipo_documento, "tipo de documento (NIT)");
    llenar("tipo_persona", pr.tipo_persona ?? "", "tipo de persona");
    llenar("nit", pr.nit, "NIT");
    llenar("dv", pr.dv, "DV");
    llenar("direccion", pr.direccion, "dirección");
    llenar("municipio", pr.municipio, "municipio");
    llenar("departamento", pr.departamento, "departamento");
    llenar("municipio_dane", pr.municipio_dane ?? "", "código DANE");
    llenar("email", pr.email, "correo");
    llenar("telefono", pr.telefono, "teléfono");
    llenar("contacto", pr.contacto, "contacto (representante legal)");
    llenar("responsabilidades_rut", pr.responsabilidades_rut, "responsabilidades del RUT");
    setB(nuevo);
    setAviso(null);
    setRut({ leido, propuesta: pr, antes, llenados });
  }

  function guardar() {
    if (problema) return;
    empezar(async () => {
      setError(null);
      const t = (v: string) => v.trim() || null;
      const sn = (v: "" | "si" | "no") => (v === "" ? null : v === "si");
      const fila = {
        nombre: b.nombre.trim(),
        tipo_documento: t(b.tipo_documento),
        nit: t(b.nit),
        dv: t(b.dv),
        tipo_persona: b.tipo_persona || null,
        email: t(b.email),
        email_encargado_proyecto: t(b.email_encargado_proyecto),
        contacto: t(b.contacto),
        telefono: t(b.telefono),
        direccion: t(b.direccion),
        municipio: t(b.municipio),
        departamento: t(b.departamento),
        municipio_dane: t(b.municipio_dane),
        responsable_iva: sn(b.responsable_iva),
        declarante_renta: sn(b.declarante_renta),
        responsabilidades_rut: b.responsabilidades_rut.length ? b.responsabilidades_rut : null,
        responsabilidades_fe: b.responsabilidades_fe.length ? b.responsabilidades_fe : null,
        notas: t(b.notas),
      };
      // El RUT leído queda registrado como RUT del cliente (confirmado: quien guarda lo revisó).
      const registrarRut = async (clienteId: string) => {
        if (!rut) return;
        const yo = (await supabase.auth.getUser()).data.user?.id ?? null;
        const { error: eDoc } = await supabase.from("documentos").insert({
          tipo_documento: "RUT",
          cliente_id: clienteId,
          storage_path: rut.leido.storagePath,
          nombre_archivo: rut.leido.nombreArchivo,
          estado: "CONFIRMADO",
          extraccion_json: rut.leido.resultado.extraccion,
          valores_confirmados_json: fila,
          costo_estimado_usd: rut.leido.resultado.costoEstimadoUsd,
          subido_por: yo,
          confirmado_por: yo,
          confirmado_en: new Date().toISOString(),
        });
        if (eDoc) setError(`El cliente se guardó, pero el RUT no quedó registrado: ${eDoc.message}`);
        setRut(null);
      };
      const supabase = createClient();
      if (cliente) {
        const { data, error: e } = await supabase.from("clientes").update(fila).eq("id", cliente.id).select("id");
        if (e) return setError(mensajeBase(e.message));
        if (!data?.length) return setError("No se guardó: no tienes permiso para editar clientes.");
        await registrarRut(cliente.id);
        setAviso("Guardado.");
        router.refresh();
      } else {
        const { data, error: e } = await supabase.from("clientes").insert(fila).select("id").single();
        if (e) return setError(mensajeBase(e.message));
        await registrarRut(data.id);
        router.replace(`/administrativo/clientes/${data.id}`);
      }
    });
  }

  const archivar = (activo: boolean) =>
    empezar(async () => {
      if (!cliente) return;
      setError(null);
      const { data, error: e } = await createClient().from("clientes").update({ activo }).eq("id", cliente.id).select("id");
      if (e) return setError(e.message);
      if (!data?.length) return setError("No se guardó: no tienes permiso para editar clientes.");
      router.refresh();
    });

  const dis = !edita;
  return (
    <div className="space-y-4">
      {!edita && (
        <p className="rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-700">
          Solo lectura: editar clientes requiere Administrativo o Comercial en nivel “trabajar”.
        </p>
      )}
      {cliente && !cliente.activo && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">Este cliente está archivado: no aparece al cotizar ni en la lista de activos.</p>
      )}
      {falta.length > 0 && (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Para facturar electrónicamente le falta: {falta.join(", ")}.
        </p>
      )}

      {edita && (
        <section className="space-y-2 rounded-lg border border-slate-200 bg-white p-3 sm:p-4">
          <h2 className="text-sm font-bold text-slate-900">Llenar desde el RUT</h2>
          <p className="text-xs text-slate-500">Lee el RUT y propone los datos: tipo de documento, NIT y DV, dirección, municipio con su código DANE y todas las responsabilidades. Revisas y guardas.</p>
          {rut ? (
            <div className="space-y-1 rounded-md border border-sky-200 bg-sky-50 p-2 text-sm text-sky-950">
              <p className="font-semibold">
                Leído con {rut.leido.proveedor}
                {rut.leido.nota ? ` (${rut.leido.nota})` : ""}. Es una propuesta: revisa y guarda.
              </p>
              <p>{rut.llenados.length ? `Se llenó: ${rut.llenados.join(", ")}.` : "El RUT no cambió ningún dato de la ficha."}</p>
              {rut.propuesta.revisar.length > 0 && <p className="text-amber-900">Revisa a mano: {rut.propuesta.revisar.join(", ")}.</p>}
              {rut.propuesta.nit_coincide === false && <p className="font-semibold text-red-800">El DV leído no corresponde al NIT: revisa los dos en el RUT.</p>}
              {rut.propuesta.dane_aviso && <p className="text-amber-900">{rut.propuesta.dane_aviso}</p>}
              <button
                type="button"
                onClick={() => {
                  setB(rut.antes);
                  setRut(null);
                }}
                className="min-h-11 text-sm font-semibold underline"
              >
                Deshacer lo del RUT
              </button>
            </div>
          ) : (
            <LectorRut clienteId={cliente?.id ?? null} onLeido={(r) => void aplicarRut(r)} />
          )}
          {avisoRut && <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">{avisoRut}</p>}
        </section>
      )}

      <section className="rounded-lg border border-slate-200 bg-white p-3 sm:p-4">
        <h2 className="mb-2 text-sm font-bold text-slate-900">Identificación (DIAN)</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={`${ETIQUETA} sm:col-span-2`}>
            Nombre / razón social
            <input disabled={dis} value={b.nombre} onChange={(e) => poner("nombre", e.target.value)} className={CAMPO} />
          </label>
          <label className={ETIQUETA}>
            Tipo de documento
            <select disabled={dis} value={b.tipo_documento} onChange={(e) => poner("tipo_documento", e.target.value)} className={CAMPO}>
              <option value="">— Sin definir —</option>
              {TIPOS_DOCUMENTO_DIAN.map((t) => (
                <option key={t.codigo} value={t.codigo}>
                  {t.codigo} — {t.nombre}
                </option>
              ))}
            </select>
          </label>
          <label className={ETIQUETA}>
            Tipo de persona
            <select disabled={dis} value={b.tipo_persona} onChange={(e) => poner("tipo_persona", e.target.value as Borrador["tipo_persona"])} className={CAMPO}>
              <option value="">— Sin definir —</option>
              <option value="natural">Persona natural</option>
              <option value="juridica">Persona jurídica</option>
            </select>
          </label>
          <label className={ETIQUETA}>
            {esNit ? "NIT" : "Número de documento"}
            <input disabled={dis} value={b.nit} onChange={(e) => poner("nit", e.target.value)} inputMode="numeric" className={CAMPO} />
            <span className={AYUDA}>{esNit ? "Sin puntos. Si lo pegas con el DV (900123456-7) se separa solo." : "Sin puntos ni espacios."}</span>
          </label>
          <label className={ETIQUETA}>
            DV
            <input disabled={dis} value={b.dv} onChange={(e) => poner("dv", e.target.value)} inputMode="numeric" maxLength={1} className={CAMPO} />
            <span className={AYUDA}>
              {esNit
                ? dvCalculado
                  ? `Si lo dejas vacío, se calcula: ${dvCalculado}. Si no corresponde, no se guarda.`
                  : "Se calcula solo a partir del NIT."
                : "Solo aplica cuando el tipo de documento es NIT."}
            </span>
          </label>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-3 sm:p-4">
        <h2 className="mb-2 text-sm font-bold text-slate-900">Contacto y ubicación</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={ETIQUETA}>
            Correo de facturación
            <input disabled={dis} type="email" value={b.email} onChange={(e) => poner("email", e.target.value)} className={CAMPO} />
            <span className={AYUDA}>A este llega la factura electrónica (DIAN).</span>
          </label>
          <label className={ETIQUETA}>
            Correo del encargado de proyecto
            <input disabled={dis} type="email" value={b.email_encargado_proyecto} onChange={(e) => poner("email_encargado_proyecto", e.target.value)} className={CAMPO} />
            <span className={AYUDA}>Opcional. Para avisos de avance, actas y envíos al responsable del proyecto en el cliente.</span>
          </label>
          <label className={ETIQUETA}>
            Persona de contacto
            <input disabled={dis} value={b.contacto} onChange={(e) => poner("contacto", e.target.value)} className={CAMPO} />
          </label>
          <label className={ETIQUETA}>
            Teléfono
            <input disabled={dis} value={b.telefono} onChange={(e) => poner("telefono", e.target.value)} inputMode="tel" className={CAMPO} />
          </label>
          <label className={`${ETIQUETA} sm:col-span-2`}>
            Dirección principal
            <input disabled={dis} value={b.direccion} onChange={(e) => poner("direccion", e.target.value)} className={CAMPO} />
          </label>
          <div className="sm:col-span-2">
            <SelectorMunicipio
              deshabilitado={dis}
              valor={{ municipio: b.municipio, departamento: b.departamento, municipio_dane: b.municipio_dane }}
              onCambio={(v) => {
                setAviso(null);
                setB((x) => ({ ...x, ...v }));
              }}
            />
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-3 sm:p-4">
        <h2 className="mb-1 text-sm font-bold text-slate-900">Datos fiscales (según el RUT)</h2>
        <p className="mb-2 text-xs text-slate-500">Verifícalos en el RUT del cliente.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={ETIQUETA}>
            Responsable de IVA
            <select disabled={dis} value={b.responsable_iva} onChange={(e) => poner("responsable_iva", e.target.value as Borrador["responsable_iva"])} className={CAMPO}>
              <option value="">— Sin definir —</option>
              <option value="si">Sí, responsable de IVA</option>
              <option value="no">No responsable de IVA</option>
            </select>
            <Sugerencia s={sugIva} actual={b.responsable_iva} si="Responsable de IVA" no="No responsable de IVA" dis={dis} onUsar={(v) => poner("responsable_iva", v)} />
          </label>
          <label className={ETIQUETA}>
            Declarante de renta
            <select disabled={dis} value={b.declarante_renta} onChange={(e) => poner("declarante_renta", e.target.value as Borrador["declarante_renta"])} className={CAMPO}>
              <option value="">— Sin definir —</option>
              <option value="si">Sí</option>
              <option value="no">No</option>
            </select>
            <span className={AYUDA}>Define la tarifa de retención en la fuente que aplica.</span>
            <Sugerencia s={sugRenta} actual={b.declarante_renta} si="Declarante" no="No declarante" dis={dis} onUsar={(v) => poner("declarante_renta", v)} />
          </label>
        </div>
        <div className="mt-3">
          <ResponsabilidadesCliente
            catalogo={catalogo}
            deshabilitado={dis}
            rut={b.responsabilidades_rut}
            fe={b.responsabilidades_fe}
            onCambio={(v) => {
              setAviso(null);
              setB((x) => ({ ...x, responsabilidades_rut: v.rut, responsabilidades_fe: v.fe }));
            }}
          />
        </div>
        <label className={`${ETIQUETA} mt-3`}>
          Notas
          <textarea disabled={dis} value={b.notas} onChange={(e) => poner("notas", e.target.value)} rows={2} className={CAMPO} />
        </label>
      </section>

      {edita && (
        <div className="space-y-2">
          <button
            type="button"
            disabled={pendiente || !!problema || (!!cliente && !cambio)}
            onClick={guardar}
            className="min-h-11 w-full rounded-lg bg-slate-900 text-sm font-semibold text-white disabled:opacity-40"
          >
            {pendiente ? "Guardando…" : cliente ? "Guardar cambios" : "Crear cliente"}
          </button>
          {problema ? (
            <p className="text-center text-sm text-red-800">{problema}</p>
          ) : cliente && !cambio && !aviso ? (
            <p className="text-center text-xs text-slate-500">Sin cambios por guardar.</p>
          ) : null}
          {aviso && <p className="text-center text-sm text-green-800">{aviso}</p>}
          {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
          {cliente && (
            <button type="button" disabled={pendiente} onClick={() => archivar(!cliente.activo)} className="min-h-11 w-full rounded-lg border border-slate-300 text-sm font-semibold text-slate-700">
              {cliente.activo ? "Archivar cliente (deja de salir al cotizar)" : "Volver a activar"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** "Sugerencia: Sí, por el código 48 (…) del RUT. [Usar]": propuesta, nunca asumida. */
function Sugerencia({
  s,
  actual,
  si,
  no,
  dis,
  onUsar,
}: {
  s: { valor: boolean; porque: string } | null;
  actual: "" | "si" | "no";
  si: string;
  no: string;
  dis: boolean;
  onUsar: (v: "si" | "no") => void;
}) {
  if (!s) return null;
  const valor = s.valor ? "si" : "no";
  if (actual === valor) return <span className={AYUDA}>Coincide con el RUT ({s.porque}).</span>;
  return (
    <span className="mt-1 block rounded-md bg-sky-50 px-2 py-1 text-xs font-normal text-sky-950">
      Sugerencia: <b>{s.valor ? si : no}</b>, {s.porque}.{actual ? " Hoy dice otra cosa: revísalo." : ""}
      {!dis && (
        <button type="button" onClick={() => onUsar(valor)} className="ml-1 min-h-9 font-semibold underline">
          Usar la sugerencia
        </button>
      )}
    </span>
  );
}
