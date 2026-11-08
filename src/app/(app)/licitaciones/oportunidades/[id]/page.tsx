import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  type FilaRadar,
  CRITERIOS,
  diasParaCierre,
  fechaCierre,
  formatoFechaHora,
  formatoPesos,
  lugar,
  nombreLinea,
} from "@/lib/licitaciones/radar";
import { ANTES_DE_LA_PUERTA, ETAPAS, nombreEstado, numeroEtapa, pruebaContratacion } from "@/lib/licitaciones/etapas";
import { Documentos, type Documento } from "./Documentos";
import { Puerta, type Decision } from "./Puerta";

// Subir archivos necesita los permisos del bucket (migración 148). Pasar a true cuando esté aplicada
// y verificada: sin ellos, cada archivo rebotaría por RLS.
const SUBIDA_ACTIVA = false;

// La ficha de una licitación (migración 147). Todo lo que se ve sale de la base; lo que todavía no
// existe (el análisis del pliego) se dice con todas las letras, no se deja en blanco.
export default async function FichaLicitacion({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const [radarRes, licRes, docsRes, reqRes, decRes, calcesRes, nivelRes] = await Promise.all([
    supabase
      .from("v_licitaciones_radar")
      .select(
        "id, id_del_proceso, entidad, departamento, ciudad, objeto, modalidad, presupuesto, cierra_en, url_secop, publicado_en, traida_en, dias_publicado_al_traer, requiere_rup, afinidad, criterios_que_coinciden, criterios_faltantes, actividad_por, lineas_que_calzaron, relevante, estado, origen",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase.from("licitaciones").select("nombre, descripcion, referencia, nit_entidad, tipo_contrato, duracion, fase, motivo_descarte, secop").eq("id", id).maybeSingle(),
    supabase
      .from("licitacion_documentos")
      .select("id, tipo, tipo_deducido, nombre_original, url_origen, extension, tamano_secop, cargado_en_secop, secop_contrato, secop_id_documento, path, sha256, notas")
      .eq("licitacion_id", id)
      .order("cargado_en_secop", { ascending: true, nullsFirst: false })
      .order("nombre_original"),
    supabase.from("licitacion_requisitos").select("id", { count: "exact", head: true }).eq("licitacion_id", id),
    supabase
      .from("licitacion_decisiones")
      .select("id, decision, razon, decidida_por, decidida_en, estado_antes, estado_despues")
      .eq("licitacion_id", id)
      .order("decidida_en", { ascending: false }),
    supabase.rpc("fn_licitacion_calces", { p_licitacion: id }),
    // Devuelve el nivel (consultar / trabajar / responsable) o null; no es booleano.
    supabase.rpc("fn_permiso_seccion", { p_modulo: "licitaciones", p_seccion: "oportunidades" }),
  ]);
  if (!radarRes.data || !licRes.data) notFound();
  const f = radarRes.data as unknown as FilaRadar & { estado: string; origen: string };
  const l = licRes.data as {
    nombre: string; descripcion: string | null; referencia: string | null; nit_entidad: string | null; tipo_contrato: string | null;
    duracion: string | null; fase: string | null; motivo_descarte: string | null; secop: Record<string, unknown> | null;
  };
  const docs = (docsRes.data ?? []) as Documento[];
  const decisiones = (decRes.data ?? []) as Decision[];
  const calces = (calcesRes.data ?? []) as { tipo: string; valor: string; nombre: string; linea: string | null }[];
  const nivel = nivelRes.data as string | null;
  const trabaja = nivel === "trabajar" || nivel === "responsable";
  const decide = nivel === "responsable";

  // Quién decidió: nombres de perfiles (si la RLS de perfiles los deja ver; si no, se dice).
  const ids = [...new Set(decisiones.map((d) => d.decidida_por))];
  const nombres = new Map<string, string>();
  if (ids.length) {
    const { data } = await supabase.from("perfiles").select("id, nombre").in("id", ids);
    for (const p of (data ?? []) as { id: string; nombre: string | null }[]) nombres.set(p.id, p.nombre ?? "");
  }

  const ahora = new Date();
  const s = l.secop ?? {};
  const fecha = (k: string) => (typeof s[k] === "string" && /^\d{4}-\d{2}-\d{2}/.test(s[k] as string) ? (s[k] as string) : null);
  const cierre = fechaCierre(f.cierra_en);
  const dias = diasParaCierre(f.cierra_en, ahora);
  // SECOP suele dar el cierre sin hora (00:00): no se inventa una hora que no trae.
  const cierreSinHora = !!f.cierra_en && /T00:00:00/.test(f.cierra_en);
  const cumple = new Set(f.criterios_que_coinciden ?? []);
  // Solo si el documento sigue clasificado como de ejecución (una persona puede corregirlo) y la señal es fuerte.
  const yaContratado = docs.some((d) => d.tipo === "ejecucion" && pruebaContratacion(d.nombre_original, d.secop_contrato));
  const etapa = numeroEtapa(f.estado);
  const fd = (iso: string | null) =>
    iso ? new Date(`${iso.slice(0, 10)}T12:00:00-05:00`).toLocaleDateString("es-CO", { timeZone: "America/Bogota", day: "2-digit", month: "short", year: "numeric" }) : "SECOP no la trae";

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 space-y-4 p-4 sm:p-6">
      <Link href="/licitaciones/oportunidades" className="text-sm text-slate-600 underline">
        ← Oportunidades
      </Link>

      {/* Encabezado: quién, qué etapa, y lo que más importa (RUP y cierre). */}
      <div className="space-y-2">
        <h1 className="text-lg font-bold text-slate-900">{f.entidad ?? "Sin entidad"}</h1>
        <p className="text-xs text-slate-500">
          {f.id_del_proceso}
          {l.referencia ? ` · ${l.referencia}` : ""}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded bg-brand-navy px-2 py-0.5 text-xs font-semibold text-white">
            {etapa ? `Etapa ${etapa} · ` : ""}
            {nombreEstado(f.estado)}
          </span>
          {f.requiere_rup === false ? (
            <span className="rounded bg-emerald-600 px-2 py-0.5 text-xs font-bold text-white">SIN RUP · se puede presentar</span>
          ) : f.requiere_rup === true ? (
            <span className="rounded bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-700">Exige RUP</span>
          ) : (
            <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">RUP: no se sabe</span>
          )}
          {f.url_secop && (
            <a href={f.url_secop} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 px-3 text-sm font-semibold text-brand-navy">
              Ver en SECOP II ↗
            </a>
          )}
        </div>
        {/* Las 11 etapas del Plan Maestro, con la actual marcada. */}
        <ol className="flex flex-wrap gap-1 text-xs">
          {ETAPAS.map((e) => (
            <li
              key={e.numero}
              className={`rounded px-1.5 py-0.5 ${
                etapa === e.numero ? "bg-brand-navy font-semibold text-white" : etapa && e.numero < etapa ? "bg-slate-200 text-slate-700" : "bg-slate-100 text-slate-500"
              }`}
            >
              {e.numero} {e.nombre}
            </li>
          ))}
        </ol>
      </div>

      {/* Avisos que cambian la lectura de todo lo demás. */}
      {yaContratado && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
          <b>Probablemente ya se contrató.</b> Entre sus documentos en SECOP hay papeles del contrato (contrato, acta de inicio, aceptación de la
          oferta u orden de compra), aunque SECOP lo muestre «Abierto». Pasa en régimen especial: la entidad publica cuando ya contrató. Revíselo en
          SECOP antes de invertirle tiempo.
        </p>
      )}
      {f.estado === "descartada" && l.motivo_descarte && (
        <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">
          <b>Descartada:</b> {l.motivo_descarte}
        </p>
      )}

      {/* Resumen */}
      <section className="rounded-lg border border-slate-300 bg-white p-3">
        <h2 className="text-base font-semibold text-slate-900">Resumen</h2>
        {l.nombre && l.nombre !== l.descripcion && <p className="mt-1 text-sm font-semibold text-slate-800">{l.nombre}</p>}
        <p className="mt-1 whitespace-pre-line text-sm text-slate-700">{l.descripcion ?? f.objeto ?? "SECOP no trae el objeto."}</p>
        <dl className="mt-3 grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
          <Dato t="Entidad" v={`${f.entidad ?? "—"}${l.nit_entidad ? ` · NIT ${l.nit_entidad}` : ""}`} />
          <Dato t="Modalidad" v={f.modalidad ?? "Sin dato"} />
          <Dato t="Tipo de contrato" v={l.tipo_contrato ?? "Sin dato"} />
          <Dato t="Cuantía" v={formatoPesos(f.presupuesto)} />
          <Dato t="Ciudad" v={lugar(f)} />
          <Dato t="Departamento" v={f.departamento ?? "Sin dato"} />
          <Dato t="Duración" v={l.duracion ?? "Sin dato"} />
          <Dato t="Fase en SECOP" v={l.fase ?? "Sin dato"} />
        </dl>
        <p className="mt-2 text-xs text-slate-500">La ciudad es la de la ENTIDAD, que no siempre es donde se ejecuta: confírmelo en el pliego.</p>
      </section>

      {/* Fechas */}
      <section className="rounded-lg border border-slate-300 bg-white p-3">
        <h2 className="text-base font-semibold text-slate-900">Fechas</h2>
        <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
          <Dato t="Publicado en SECOP" v={fd(fecha("fecha_de_publicacion_del"))} />
          <Dato t="Última publicación (adendas, cambios)" v={fd(fecha("fecha_de_ultima_publicaci"))} />
          <Dato
            t="Cierre (recepción de ofertas)"
            v={
              cierre
                ? `${cierreSinHora ? fd(f.cierra_en) + " (SECOP no trae la hora)" : formatoFechaHora(cierre)} · ${
                    dias === 0 ? "hoy" : dias === 1 ? "mañana" : dias != null && dias < 0 ? "ya cerró" : `faltan ${dias} días`
                  }`
                : "SECOP no trae la fecha de cierre"
            }
          />
          <Dato t="Apertura de ofertas" v={fd(fecha("fecha_de_apertura_de_respuesta"))} />
          <Dato
            t="Nos enteramos"
            v={f.dias_publicado_al_traer == null ? "Sin dato" : f.dias_publicado_al_traer === 0 ? "el mismo día" : `${f.dias_publicado_al_traer} días después de publicado`}
          />
          <Dato t="Lo trajo el radar" v={formatoFechaHora(new Date(f.traida_en))} />
        </dl>
        <p className="mt-2 text-xs text-slate-500">
          Datos Abiertos no trae el cronograma completo (observaciones, audiencias, adendas): está en SECOP II. Datos Abiertos va de 1 a 3 días atrás.
        </p>
      </section>

      {/* Resumen operativo */}
      <section className="rounded-lg border border-slate-300 bg-white p-3">
        <h2 className="text-base font-semibold text-slate-900">Resumen operativo</h2>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className={`rounded px-2 py-0.5 text-xs font-bold ${f.relevante ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-700"}`}>
            {f.afinidad ?? 0}/5{f.relevante ? " · relevante" : " · no relevante"}
          </span>
          {CRITERIOS.map((c) => (
            <span key={c.id} className={`rounded px-1.5 py-0.5 text-xs ${cumple.has(c.id) ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700 line-through decoration-red-300"}`}>
              {cumple.has(c.id) ? "✓" : "✗"} {c.nombre}
            </span>
          ))}
        </div>
        <p className="mt-2 text-sm text-slate-700">
          Entró por <b>{(f.lineas_que_calzaron ?? []).map(nombreLinea).join(" + ") || "—"}</b>
          {f.actividad_por === "palabra" ? (
            <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-900">⚠ por palabra, no por código: calce más débil, revisar</span>
          ) : f.actividad_por === "unspsc" ? (
            <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700">por código UNSPSC</span>
          ) : null}
        </p>
        {calces.length > 0 && (
          <p className="mt-1 text-sm text-slate-700">
            {f.actividad_por === "palabra" ? "Palabras que calzaron: " : "Códigos que calzaron: "}
            {calces.map((c) => (
              <span key={c.tipo + c.valor} className="mr-1 inline-block rounded bg-slate-100 px-1.5 py-0.5 text-xs">
                {c.valor}
                {c.tipo === "categoria" && c.nombre !== c.valor ? ` · ${c.nombre}` : ""}
              </span>
            ))}
          </p>
        )}
      </section>

      {/* Los pliegos */}
      <Documentos licitacionId={f.id} documentos={docs} puedeTraer={trabaja && f.origen !== "manual"} puedeEditar={trabaja} puedeSubir={trabaja && SUBIDA_ACTIVA} />

      {/* Qué piden: el motor de análisis aún no existe. Se dice, no se deja en blanco. */}
      <section className="rounded-lg border border-amber-300 bg-amber-50 p-3">
        <h2 className="text-base font-semibold text-amber-900">Qué piden</h2>
        {(reqRes.count ?? 0) === 0 ? (
          <p className="mt-1 text-sm text-amber-900">
            <b>Todavía no se ha analizado el pliego.</b> Que aquí no aparezcan requisitos NO quiere decir que no pidan nada: quiere decir que nadie los
            ha leído aún. Experiencia, capacidad financiera, RUP, pólizas y habilitantes están en el pliego o la invitación (arriba, en SECOP). El análisis
            automático del pliego es la siguiente pieza del módulo.
          </p>
        ) : (
          <p className="mt-1 text-sm text-amber-900">{reqRes.count} requisitos cargados.</p>
        )}
      </section>

      {/* La puerta GO/NO-GO */}
      <Puerta
        licitacionId={f.id}
        estado={f.estado}
        antesDeLaPuerta={ANTES_DE_LA_PUERTA.includes(f.estado)}
        decide={decide}
        trabaja={trabaja}
        decisiones={decisiones.map((d) => ({ ...d, nombre: nombres.get(d.decidida_por) ?? null }))}
      />
    </div>
  );
}

function Dato({ t, v }: { t: string; v: string }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{t}</dt>
      <dd className="text-slate-800">{v}</dd>
    </div>
  );
}
