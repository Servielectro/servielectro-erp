/* eslint-disable @next/next/no-img-element */
import type { TecnicoEnObra } from "@/lib/sst/plantillas";

/**
 * Vista previa FIEL AL PAPEL de los formatos que la tienen (migración 112: FOR-14 ATS y FOR-15
 * alturas, versión 2026). Pedido de Jhojan: "que salga el mismo". Replica el encabezado (logo,
 * código, fecha y versión del control documental), las tablas con sus filas fijas y la cuadrícula
 * de firmas por día (LUNES…SABADO). Como el documento de la cotización, usa tamaños en px propios
 * del papel (no la escala de la app) y va apaisado al imprimir.
 *
 * Sirve igual en la oficina (datos de la base, firmas con enlace firmado) y en el celular sin señal
 * (datos de IndexedDB, firmas como blob): por eso recibe datos planos.
 */
export interface FirmaPapel {
  rol: string;
  nombre: string;
  documento: string;
  cargo: string | null;
  url: string | null;
  /** Hora de la firma en el dispositivo (ISO): de ahí sale el día. */
  firmadaEn: string;
}
export interface DatosPapel {
  codigo: string;
  control: { codigo?: string; version?: string; fecha?: string } | null;
  fecha: string;
  lugar: string | null;
  proyecto: string | null;
  respuestas: Record<string, unknown>;
  tecnicos: TecnicoEnObra[];
  firmas: FirmaPapel[];
}

/** El papel de 2026 de cada código (el valor por defecto si la plantilla no trae su control). */
const CONTROL: Record<string, { codigo: string; version: string; fecha: string; titulo: string }> = {
  "FOR-14": { codigo: "FOR-14", version: "02", fecha: "2026-04-08", titulo: "FORMATO ANALISIS DE TRABAJO SEGURO" },
  "FOR-15": { codigo: "FOR-15", version: "02", fecha: "2026-06-05", titulo: "PERMISO DE TRABAJO EN ALTURAS" },
};

export function tieneHojaPropia(codigo: string | null | undefined): boolean {
  return !!codigo && codigo in CONTROL;
}

export function HojaFormato({ d }: { d: DatosPapel }) {
  if (d.codigo === "FOR-14") return <Hoja14 d={d} />;
  if (d.codigo === "FOR-15") return <Hoja15 d={d} />;
  return null;
}

// ------------------------------------------------------------------ utilidades
const DIAS = ["LUNES", "MARTES", "MIERCOLES", "JUEVES", "VIERNES", "SABADO"];
const MESES = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"];
const ddmmaaaa = (f: string | null | undefined) => (f && /^\d{4}-\d{2}-\d{2}/.test(f) ? `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}` : "");
const diaBogota = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
/** 0 = lunes … 5 = sábado; -1 = domingo (el papel no tiene columna). */
const columnaDia = (iso: string) => {
  const dow = new Date(`${diaBogota(iso)}T12:00:00Z`).getUTCDay();
  return dow === 0 ? -1 : dow - 1;
};
const doc = (s: string) => s.toUpperCase().replace(/[^0-9A-Z]/g, "");
const txt = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const fila = (r: Record<string, unknown>, tabla: string, f: string, col: string) =>
  txt(((r[tabla] as Record<string, Record<string, unknown>> | undefined)?.[f] ?? {})[col]);
const siNo = (v: unknown) => (v === true ? "SI" : v === false ? "NO" : "");

function Encabezado({ d, grande }: { d: DatosPapel; grande?: boolean }) {
  const def = CONTROL[d.codigo];
  const c = { ...def, ...(d.control ?? {}) };
  return (
    <table className="w-full border-collapse border border-black">
      <tbody>
        <tr>
          <td className="w-[18%] border border-black p-2">
            <img src="/logo-servielectro.png" alt="Servielectro" className="h-10 w-auto" />
          </td>
          <td className={`border border-black p-2 text-center font-bold italic ${grande ? "text-[22px]" : "text-[11px]"}`}>{def.titulo}</td>
          <td className="w-[16%] border border-black p-0 text-center text-[10px] font-bold">
            <p className="border-b border-black py-1">Código: {c.codigo}</p>
            <p className="border-b border-black py-1">Fecha: {ddmmaaaa(c.fecha)}</p>
            <p className="py-1">Versión: {c.version}</p>
          </td>
        </tr>
      </tbody>
    </table>
  );
}

/** La cuadrícula de firmas por día de una persona (o de un bloque). */
function CeldasDias({ firmas }: { firmas: FirmaPapel[] }) {
  return (
    <>
      {DIAS.map((_, i) => {
        const delDia = firmas.filter((f) => columnaDia(f.firmadaEn) === i);
        return (
          <td key={i} className="h-9 border border-black p-0.5 text-center align-middle">
            {delDia.map((f, j) => (
              <span key={j} className="block">
                {f.url ? <img src={f.url} alt={`Firma de ${f.nombre}`} className="mx-auto h-7 w-full object-contain" /> : <span className="text-[8px]">Firmó</span>}
                <span className="block text-[7px] leading-none text-slate-600">{ddmmaaaa(diaBogota(f.firmadaEn))}</span>
              </span>
            ))}
          </td>
        );
      })}
    </>
  );
}

function Domingos({ firmas }: { firmas: FirmaPapel[] }) {
  const dom = firmas.filter((f) => columnaDia(f.firmadaEn) === -1);
  if (!dom.length) return null;
  return <p className="mt-1 text-[9px]">Firmas en domingo (el papel no tiene columna): {dom.map((f) => `${f.nombre} ${ddmmaaaa(diaBogota(f.firmadaEn))}`).join(" · ")}</p>;
}

/** Las personas de la lista, con al menos `minimo` renglones (los vacíos del papel). */
function conRenglones<T>(lista: T[], minimo: number): (T | null)[] {
  return [...lista, ...Array.from({ length: Math.max(0, minimo - lista.length) }, () => null)];
}

// ------------------------------------------------------------------ FOR-14 ATS (versión 02)
const ROSA = "#E6B8B7";
const ROSA_CLARO = "#F2DCDB";
const PASOS_14 = [
  ["alistamiento", "1) ALISTAMIENTO:"],
  ["desplazamiento", "2). DESPLAZAMIENTO:"],
  ["ingreso", "3) INGRESO A LA ZONA A OPERAR:"],
  ["realizacion", "4) REALIZACION DE LA TAREA:"],
  ["finalizacion", "5) FINALIZACION DE LA TAREA:"],
];
const EPP_14 = [
  [["casco", "Casco con Barbuquejo"], ["guantes", "Guantes"]],
  [["tapa_oidos", "Tapa oídos"], ["tapabocas", "Tapabocas"]],
  [["monogafas", "Monogafas"], ["botas_seguridad", "Botas de seguridad"]],
  [["overol", "Overol"], ["botas_caucho", "Botas de Caucho"]],
];

function Hoja14({ d }: { d: DatosPapel }) {
  const r = d.respuestas;
  const et = "border border-black px-1 py-0.5 text-right font-bold italic";
  const exp = d.fecha;
  const vh = txt(r.valido_hasta);
  const mes = (f: string) => (f ? MESES[Number(f.slice(5, 7)) - 1] ?? "" : "");
  const autoriza = d.firmas.filter((f) => f.rol === "responsable_sst");
  const supervisa = d.firmas.filter((f) => f.rol === "otro");
  const tecnicos = d.firmas.filter((f) => f.rol === "tecnico");
  const marca = (tabla: string, f: string, op: string) => (fila(r, tabla, f, "uso") === op ? "X" : "");
  return (
    <div className="hoja-sst mx-auto w-[1000px] bg-white p-4 font-sans text-[9px] leading-tight text-black">
      <Encabezado d={d} />
      <table className="w-full border-collapse border border-black">
        <colgroup>
          <col className="w-[18%]" />
          <col className="w-[10%]" />
          <col className="w-[10%]" />
          <col className="w-[10%]" />
          <col className="w-[13%]" />
          <col className="w-[39%]" />
        </colgroup>
        <tbody>
          <tr>
            <td className={et} style={{ background: ROSA }}>AREA O DEPENDENCIA</td>
            <td colSpan={5} className="border border-black px-1">{txt(r.area)}</td>
          </tr>
          <tr>
            <td className={et} style={{ background: ROSA }}>HERRAMIENTAS O EQUIPOS:</td>
            <td colSpan={5} className="whitespace-pre-line border border-black px-1">{txt(r.herramientas)}</td>
          </tr>
          <tr>
            <td className={et} style={{ background: ROSA }}>NUMERO CONSECUTIVO DE FORMATO:</td>
            <td colSpan={5} className="border border-black px-1">{txt(r.consecutivo)}</td>
          </tr>
          <tr>
            <td className={et} style={{ background: ROSA }}>Proyecto:</td>
            <td className="border border-black px-1">{d.proyecto ?? ""}</td>
            <td className="border border-black px-1 font-bold italic" style={{ background: ROSA }}>Fecha de expedición:</td>
            <td className="border border-black px-1">DIA: <b>{exp ? exp.slice(8, 10) : ""}</b></td>
            <td className="border border-black px-1">MES: <b>{mes(exp)}</b></td>
            <td className="border border-black px-1 text-right font-bold italic">Año {exp ? exp.slice(0, 4) : ""}</td>
          </tr>
          <tr>
            <td rowSpan={3} className={et} style={{ background: ROSA }}>Ubicación específica del sitio:</td>
            <td rowSpan={3} className="border border-black px-1 align-top">{d.lugar ?? ""}</td>
            <td className="border border-black px-1 font-bold italic" style={{ background: ROSA }}>Valido hasta:</td>
            <td className="border border-black px-1">DIA: <b>{vh ? vh.slice(8, 10) : ""}</b></td>
            <td className="border border-black px-1">MES: <b>{mes(vh)}</b></td>
            <td className="border border-black px-1 text-right font-bold italic">Año {vh ? vh.slice(0, 4) : ""}</td>
          </tr>
          <tr>
            <td colSpan={2} className="border border-black px-1 text-center font-bold italic underline" style={{ background: ROSA }}>Hora de Inicio de la tarea :</td>
            <td colSpan={2} className="border border-black px-1">{txt(r.hora_inicio)}</td>
          </tr>
          <tr>
            <td colSpan={2} className="border border-black px-1 text-center font-bold italic underline" style={{ background: ROSA }}>Hora de terminacion de la tarea:</td>
            <td colSpan={2} className="border border-black px-1">{txt(r.hora_fin)}</td>
          </tr>
          <tr style={{ background: ROSA }}>
            <td className={et}>Tipo de actividad, marque con una X:</td>
            <td className="border border-black px-1 text-center font-bold">Rutinaria:</td>
            <td className="border border-black bg-white text-center font-bold">{r.tipo_actividad === "Rutinaria" ? "X" : ""}</td>
            <td className="border border-black px-1 font-bold">No Rutinaria:</td>
            <td className="border border-black bg-white text-center font-bold">{r.tipo_actividad === "No Rutinaria" ? "X" : ""}</td>
            <td className="border border-black" />
          </tr>
          <tr>
            <td colSpan={6} className="border border-black text-center font-bold italic underline" style={{ background: ROSA }}>DESCRIPCIÓN DE LA ACTIVIDAD</td>
          </tr>
          <tr>
            <td colSpan={6} className="min-h-6 whitespace-pre-line border border-black px-1 py-1">{txt(r.descripcion_actividad)}</td>
          </tr>
        </tbody>
      </table>

      <table className="mt-3 w-full border-collapse border border-black">
        <colgroup>
          <col className="w-[18%]" />
          <col className="w-[10%]" />
          <col className="w-[23%]" />
          <col className="w-[22%]" />
          <col className="w-[27%]" />
        </colgroup>
        <thead>
          <tr className="text-center font-bold" style={{ background: ROSA }}>
            <th className="border border-black p-1">DESCRIPCION DE LA TAREA<br />(paso a paso)</th>
            <th className="border border-black p-1">PELIGROS EXISTENTES</th>
            <th className="border border-black p-1">CONSECUENCIAS<br />(Personas - Propiedad - Medio Ambiente)</th>
            <th className="border border-black p-1">CONTROLES REQUERIDOS</th>
            <th className="border border-black p-1">REVISADO Y APROBADO</th>
          </tr>
        </thead>
        <tbody>
          {PASOS_14.map(([id, nombre]) => (
            <tr key={id} className="align-top">
              <td className="h-16 whitespace-pre-line border border-black p-1"><b>{nombre}</b> {fila(r, "pasos", id, "tarea")}</td>
              <td className="whitespace-pre-line border border-black p-1">{fila(r, "pasos", id, "peligros")}</td>
              <td className="whitespace-pre-line border border-black p-1">{fila(r, "pasos", id, "consecuencias")}</td>
              <td className="whitespace-pre-line border border-black p-1">{fila(r, "pasos", id, "controles")}</td>
              <td className="whitespace-pre-line border border-black p-1">{fila(r, "pasos", id, "revisado")}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="salto-pagina" />
      <table className="mt-3 w-full border-collapse border border-black">
        <colgroup>
          <col className="w-[18%]" />
          <col className="w-[10%]" />
          <col className="w-[10%]" />
          <col className="w-[12%]" />
          <col className="w-[12%]" />
          <col className="w-[10%]" />
          <col className="w-[12%]" />
          <col className="w-[16%]" />
        </colgroup>
        <tbody>
          <tr>
            <td colSpan={8} className="border border-black py-1 text-center font-bold italic underline" style={{ background: ROSA }}>2.EQUIPOS DE PROTECCION INDIVIDUAL (EPP)</td>
          </tr>
          <tr className="text-center font-bold" style={{ background: ROSA_CLARO }}>
            <td className="border border-black p-1">ESPECIFICAR EPP</td>
            <td className="border border-black">SI</td>
            <td className="border border-black">NO</td>
            <td className="border border-black">N/A</td>
            <td className="border border-black p-1">ESPECIFICAR EPP</td>
            <td className="border border-black">SI</td>
            <td className="border border-black">NO</td>
            <td className="border border-black">N/A</td>
          </tr>
          {EPP_14.map(([a, b]) => (
            <tr key={a[0]} className="h-6 text-center">
              <td className="border border-black px-1 text-left font-bold">{a[1]}</td>
              <td className="border border-black font-bold">{marca("epp", a[0], "SI")}</td>
              <td className="border border-black font-bold">{marca("epp", a[0], "NO")}</td>
              <td className="border border-black font-bold">{marca("epp", a[0], "N/A")}</td>
              <td className="border border-black px-1 text-left font-bold">{b[1]}</td>
              <td className="border border-black font-bold">{marca("epp", b[0], "SI")}</td>
              <td className="border border-black font-bold">{marca("epp", b[0], "NO")}</td>
              <td className="border border-black font-bold">{marca("epp", b[0], "N/A")}</td>
            </tr>
          ))}
          <tr>
            <td colSpan={8} className="border border-black px-1 py-1 font-bold">
              Otros: Cuales? <span className="font-normal underline">{txt(r.epp_otros) || " ".repeat(40)}</span>
            </td>
          </tr>
        </tbody>
      </table>

      <table className="w-full border-collapse border border-black">
        <colgroup>
          <col className="w-[18%]" />
          <col className="w-[10%]" />
          {DIAS.map((x) => (
            <col key={x} className="w-[12%]" />
          ))}
        </colgroup>
        <tbody>
          <tr>
            <td colSpan={8} className="border border-black py-1 text-center font-bold italic underline" style={{ background: ROSA }}>3. EQUIPO QUE ELABORA EL ATS</td>
          </tr>
          <tr className="text-center font-bold" style={{ background: ROSA_CLARO }}>
            <td rowSpan={2} className="border border-black p-1">NOMBRES Y APELLIDOS</td>
            <td rowSpan={2} className="border border-black p-1">CEDULA</td>
            <td colSpan={6} className="border border-black p-1">FIRMAS DIAS DE LA SEMANA</td>
          </tr>
          <tr className="text-center font-bold" style={{ background: ROSA_CLARO }}>
            {DIAS.map((x) => (
              <td key={x} className="border border-black p-1">{x}</td>
            ))}
          </tr>
          {[
            ["Encargado y/o responsable quien autoriza la labor:", autoriza],
            ["Persona que supervisa la actividad:", supervisa],
          ].map(([etiqueta, fs]) => {
            const lista = fs as FirmaPapel[];
            const nombres = [...new Set(lista.map((f) => f.nombre))].join(" / ");
            const cedulas = [...new Set(lista.map((f) => f.documento))].join(" / ");
            return (
              <tr key={etiqueta as string}>
                <td className="border border-black px-1 text-center font-bold">
                  {etiqueta as string}
                  {nombres && <span className="block font-normal">{nombres}</span>}
                </td>
                <td className="border border-black px-1 text-center">{cedulas}</td>
                <CeldasDias firmas={lista} />
              </tr>
            );
          })}
          <tr className="text-center font-bold" style={{ background: ROSA_CLARO }}>
            <td colSpan={2} className="border border-black p-1">DATOS DEL TRABAJADOR</td>
            <td colSpan={6} className="border border-black p-1">FIRMAS DIAS DE LA SEMANA</td>
          </tr>
          <tr className="text-center font-bold" style={{ background: ROSA_CLARO }}>
            <td className="border border-black p-1">NOMBRES Y APELLIDOS</td>
            <td className="border border-black p-1">CEDULA</td>
            {DIAS.map((x) => (
              <td key={x} className="border border-black p-1">{x}</td>
            ))}
          </tr>
          {conRenglones(d.tecnicos, 5).map((t, i) => (
            <tr key={i}>
              <td className="border border-black px-1 align-top">
                {i + 1}. {t?.nombre ?? ""}
              </td>
              <td className="border border-black px-1 text-center">{t?.documento ?? ""}</td>
              <CeldasDias firmas={t ? tecnicos.filter((f) => doc(f.documento) === doc(t.documento)) : []} />
            </tr>
          ))}
          <tr>
            <td colSpan={8} className="whitespace-pre-line border border-black px-1 py-1">
              <b>Observaciones</b> {txt(r.observaciones)}
            </td>
          </tr>
        </tbody>
      </table>
      <Domingos firmas={d.firmas} />
    </div>
  );
}

// ------------------------------------------------------------------ FOR-15 alturas (versión 02)
const SALMON = "#FF8080";
const AZUL = "#BDD7EE";
const LEGAL_15 =
  "Resolución 4272 de 2021, Artículo 15.  El permiso de trabajo en alturas es un mecanismo que mediante la verificación y control previo de todos los aspectos relacionados en la presente resolución, tiene como objeto prevenir la ocurrencia de accidentes durante la realización de trabajos en alturas.\nTodos los trabajos en alturas deben obedecer a una acción planificada, organizada y ejecutada por trabajadores autorizados que debe verse reflejada en los controles administrativos como el Permiso de trabajo, el cuál es obligatorio en todos los trabajos en altura independiente de su frecuencia de ejecución.";
const PASOS_15 = [
  ["ingreso", "1)INGRESO:"],
  ["alistar", "2)ALISTAR HERRAMIENTAS  MANUALES Y ELECTRICAS, QUIMICOS, EPCC COMO:"],
  ["traslado", "3) TRASLADO :"],
  ["ejecucion", "4) EJECUCIÓN DE LA TAREA:"],
  ["finalizacion", "5) Finalización:"],
];
const MEDIDAS = ["Delimitación", "Señalización", "Línea de advertencia", "Barandas", "Manejo de desniveles", "Control en superficies con huecos o aberturas", "Ayudante de seguridad"];
const ACCESOS = ["Banca Metalica", "Escalera de extensión", "Escalera tipo gato", "Escaleras", "Elevador de Personas", "Grúa con canasta", "Tioff", "Otro"];
const TAR = ["Espacios Confinados", "Trabajo en caliente", "Energías Peligrosas"];
const EPCC_15: [string, string][] = [
  ["anclaje_movil", "Anclaje móvil"],
  ["linea_vertical", "Línea de vida vertical"],
  ["linea_horizontal", "Línea de vida horizontal"],
  ["arnes", "Arnés de cuerpo entero"],
  ["eslinga_posicionamiento", "Eslinga de posicionamiento y/o restricción"],
  ["silla", "Silla de suspensión"],
  ["guantes", "Guantes de seguridad"],
  ["casco", "Casco con barbuquejo mínimo 3 puntos"],
  ["gafas", "Gafas de seguridad"],
  ["calzado", "Calzado antideslizante"],
  ["arrestador", "Arrestador para línea de vida"],
  ["red", "Red de seguridad"],
  ["eslinga_absorbedor", "Eslinga con absorbedor de impacto"],
  ["tapabocas", "Tapabocas"],
  ["tapaoidos", "Tapaoidos"],
];
const CHEQUEO: [string, string][] = [
  ["c01", "Se realizó el análisis de peligros por actividad y se cumplen los controles."],
  ["c02", "Los trabajadores autorizados conocen las medidas de precaución establecidas en el análisis de peligros por actividad."],
  ["c03", "El personal inspeccionó los equipos que conforman el sistema de protección contra caídas definido para la tarea."],
  ["c04", "El sistema de acceso fue inspeccionado por el coordinador de trabajo en alturas o una persona calificada y cumple con todos los aspectos de seguridad."],
  ["c05", "El sistema de protección contra caídas elegido permite obtener una distancia de claridad favorable para el trabajo (Requerimiento de claridad)."],
  ["c06", "Los equipos de protección contra caídas cuentan con la inspección anual por parte de un representante del fabricante o persona calificada."],
  ["c07", "Las escaleras utilizadas para trabajo seguro en alturas cuentan con las certificaciones y sistemas de protección de caídas que se ajusten a estas."],
  ["c08", "Cada trabajador cuenta con punto de anclaje para la labor."],
  ["c09", "Los puntos de anclaje a utilizar están certificados."],
  ["c10", "Si va a utilizar sustancias químicas, cuenta con los controles para su manipulación."],
  ["c11", "El personal que va a realizar la labor conoce el procedimiento de emergencia y rescate."],
  ["c12", "Esta presente una persona para que active el plan de emergencia en caso de ser necesario."],
  ["c13", "Se ha dispuesto de los elementos necesarios para izar y descender la herramienta."],
  ["c14", "Se han consultado otros permisos y se cumple con los requerimientos de éstos."],
  ["c15", "El sitio donde se ejecutará el trabajo está aislado y señalizado completamente."],
  ["c16", "Se verificaron las condiciones climáticas y hay ausencia de lluvia, tormenta eléctrica, fuertes vientos y/o calor o frío excesivo"],
  ["c17", "Las cuerdas a utilizar en los sistemas de protección contra caídas se encuentran libres de nudos."],
  ["c18", "¿Se garantiza que los sistemas de acceso están ubicados a distancias seguras de las líneas eléctricas?"],
];
const COLS_EJECUTOR = [
  ["aptitud_alturas", "Tiene exámen Médico Ocupacional con énfasis para trabajo en alturas de menos de un año, donde especifíca que es apto para trabajo en alturas?."],
  ["ss_al_dia", "Tiene pago al día la seguridad Social (EPS, AFP, ARL)"],
  ["condicion_restrictiva", "Miedo a las Alturas (Acrofobia), Sufre de Epilépsia, Mareos o Vértigo?"],
  ["anclaje_verificado", "Se verifico el punto de anclaje del colaborador, (Certificados, estructurales, autorizados)."],
  ["epcc", "EPCC"],
];

function Casilla({ on }: { on: boolean }) {
  return <span className="inline-block h-3 w-3 border border-black text-center align-middle text-[8px] font-bold leading-[10px]">{on ? "X" : ""}</span>;
}

function Hoja15({ d }: { d: DatosPapel }) {
  const r = d.respuestas;
  const barra = "border border-black py-1 text-center font-bold";
  const lista = (id: string) => (Array.isArray(r[id]) ? (r[id] as string[]) : []);
  const autorizador = d.firmas.filter((f) => f.rol === "responsable_sst");
  const ejecutoresFirmas = d.firmas.filter((f) => f.rol === "tecnico");
  const marcaEpcc = (id: string, op: string) => fila(r, "epcc", id, "uso") === op;
  const marcaChequeo = (id: string, op: string) => (fila(r, "chequeo", id, "cumple") === op ? "X" : "");
  const primeraFirma = (t: TecnicoEnObra) => ejecutoresFirmas.find((f) => doc(f.documento) === doc(t.documento));
  return (
    <div className="hoja-sst mx-auto w-[1000px] bg-white p-4 font-sans text-[9px] leading-tight text-black">
      <Encabezado d={d} grande />
      <table className="w-full border-collapse border border-black">
        <tbody>
          <tr>
            <td className={barra} style={{ background: SALMON }}>PERMISO DE TRABAJO EN ALTURA</td>
          </tr>
          <tr>
            <td className="whitespace-pre-line border border-black p-1">{LEGAL_15}</td>
          </tr>
          <tr>
            <td className={barra} style={{ background: SALMON }}>1. DATOS BASICOS DEL PERMISO DE TRABAJO EN ALTURA</td>
          </tr>
        </tbody>
      </table>
      <table className="w-full border-collapse border border-black">
        <colgroup>
          <col className="w-[33%]" />
          <col className="w-[33%]" />
          <col className="w-[34%]" />
        </colgroup>
        <tbody>
          <tr>
            <td className="border border-black px-1">
              Tipo de trabajo: Rutinario <Casilla on={r.tipo_trabajo === "Rutinario"} /> Ocasional <Casilla on={r.tipo_trabajo === "Ocasional"} />
            </td>
            <td colSpan={2} className="border border-black px-1">
              Altura aproximada a la cual se va a desarrollar la actividad: <b>{txt(r.altura_m)}</b> mts.
            </td>
          </tr>
          <tr className="h-6">
            <td className="border border-black px-1">Dirrección: {txt(r.direccion)}</td>
            <td className="border border-black px-1">Ciudad: {txt(r.ciudad)}</td>
            <td className="border border-black px-1">Lugar de Trabajo: {txt(r.lugar_trabajo)}</td>
          </tr>
          <tr className="h-6">
            <td className="border border-black px-1">Área/Proceso: {txt(r.area_proceso)}</td>
            <td className="border border-black px-1">Ubicación donde se realiza el trabajo: {d.lugar ?? ""}</td>
            <td className="border border-black px-1">Vigencia del Permiso: {txt(r.vigencia_permiso)}</td>
          </tr>
          <tr className="h-6">
            <td className="border border-black px-1">Fecha de realización del Trabajo (dd/mm/aaaa): {ddmmaaaa(d.fecha)}</td>
            <td className="border border-black px-1">Hora de Inicio (a.m./p.m.): {txt(r.hora_inicio)}</td>
            <td className="border border-black px-1">Hora de Finalización (a.m./p.m.): {txt(r.hora_fin)}</td>
          </tr>
        </tbody>
      </table>

      <table className="w-full border-collapse border border-black">
        <colgroup>
          <col className="w-[10%]" />
          <col className="w-[17%]" />
          <col className="w-[11%]" />
          <col className="w-[12%]" />
          <col className="w-[8%]" />
          <col className="w-[9%]" />
          <col className="w-[12%]" />
          <col className="w-[13%]" />
        </colgroup>
        <thead>
          <tr className="text-center font-bold" style={{ background: SALMON }}>
            <th rowSpan={2} className="border border-black p-1">Nombres y Apellidos (Ejecutor)</th>
            <th rowSpan={2} className="border border-black p-1">Cedula</th>
            <th colSpan={5} className="border border-black p-0.5">Marque SI o NO según corresponda</th>
            <th rowSpan={2} className="border border-black p-1">Firma</th>
          </tr>
          <tr className="text-center font-bold" style={{ background: SALMON }}>
            {COLS_EJECUTOR.map(([id, nombre]) => (
              <th key={id} className="border border-black p-0.5 text-[8px]">{nombre}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {conRenglones(d.tecnicos, 6).map((t, i) => {
            const f = t ? primeraFirma(t) : undefined;
            return (
              <tr key={i} className="h-5 text-center">
                <td className="border border-black px-1 text-left">{t?.nombre ?? ""}</td>
                <td className="border border-black px-1">{t?.documento ?? ""}</td>
                {COLS_EJECUTOR.map(([id]) => (
                  <td key={id} className="border border-black font-bold">{t ? siNo(t[id]) : ""}</td>
                ))}
                <td className="border border-black p-0">{f?.url ? <img src={f.url} alt="" className="mx-auto h-5 w-full object-contain" /> : ""}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <table className="w-full border-collapse border border-black">
        <colgroup>
          <col className="w-[23%]" />
          <col className="w-[18%]" />
          <col className="w-[22%]" />
          <col className="w-[23%]" />
          <col className="w-[14%]" />
        </colgroup>
        <thead>
          <tr>
            <th colSpan={5} className={barra} style={{ background: SALMON }}>2. DESCRIPCION DEL TRABAJO A REALIZAR</th>
          </tr>
          <tr className="text-center text-[10px] font-bold italic">
            <th className="border border-black">DESCRIPCIÓN DE LA TAREA</th>
            <th className="border border-black">IDENTIFICACIÓN DE</th>
            <th className="border border-black">CONSECUENCIAS</th>
            <th className="border border-black">CONTROLES EXISTENTES</th>
            <th className="border border-black">REVISADO Y APROBADO</th>
          </tr>
        </thead>
        <tbody>
          {PASOS_15.map(([id, nombre], i) => (
            <tr key={id} className={`align-top ${i === 2 ? "salto-pagina" : ""}`}>
              <td className="h-16 whitespace-pre-line border border-black p-1">
                <i>{nombre}</i> {fila(r, "pasos", id, "tarea")}
              </td>
              <td className="whitespace-pre-line border border-black p-1">{fila(r, "pasos", id, "peligros")}</td>
              <td className="whitespace-pre-line border border-black p-1">{fila(r, "pasos", id, "consecuencias")}</td>
              <td className="whitespace-pre-line border border-black p-1">{fila(r, "pasos", id, "controles")}</td>
              <td className="whitespace-pre-line border border-black p-1">{fila(r, "pasos", id, "revisado")}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <table className="w-full border-collapse border border-black">
        <tbody>
          <tr>
            <td colSpan={4} className={barra} style={{ background: SALMON }}>3. MEDIDAS DE PREVENCION Y PROTECCION</td>
          </tr>
          <tr>
            <td className="w-[14%] border border-black px-1 font-bold">Medidas de prevención a utilizar:</td>
            <td colSpan={3} className="border border-black px-1">
              {MEDIDAS.map((m) => (
                <span key={m} className="mr-3 inline-block">
                  {m} <Casilla on={lista("medidas_prevencion").includes(m)} />
                </span>
              ))}
            </td>
          </tr>
          <tr>
            <td className="border border-black px-1 font-bold">Sistemas de acceso a utilizar:</td>
            <td colSpan={3} className="border border-black px-1">
              {ACCESOS.map((m) => (
                <span key={m} className="mr-3 inline-block">
                  {m} <Casilla on={lista("sistemas_acceso").includes(m)} />
                </span>
              ))}
            </td>
          </tr>
          <tr>
            <td colSpan={2} className="border border-black px-1">Cuál: {txt(r.sistemas_acceso_cual)}</td>
            <td colSpan={2} className="border border-black px-1">
              <b>Se Involucran otras TAR :</b> Sí <Casilla on={r.otras_tar === true} /> No <Casilla on={r.otras_tar === false} />{" "}
              {TAR.map((m) => (
                <span key={m} className="ml-2 inline-block">
                  {m} <Casilla on={lista("otras_tar_cuales").includes(m)} />
                </span>
              ))}{" "}
              Otras <Casilla on={!!txt(r.otras_tar_otras)} /> (¿Cuáles?) {txt(r.otras_tar_otras)}
            </td>
          </tr>
          <tr>
            <td colSpan={4} className="border border-black px-1 font-bold">Equipos de Protección contra caídas y elementos de protección personal:</td>
          </tr>
          {[0, 1, 2, 3].map((g) => (
            <tr key={g}>
              {EPCC_15.slice(g * 4, g * 4 + 4).map(([id, nombre]) => (
                <td key={id} className="border border-black px-1">
                  {nombre} <span className="ml-1">Sí</span> <Casilla on={marcaEpcc(id, "Sí")} /> NA <Casilla on={marcaEpcc(id, "NA")} />
                </td>
              ))}
              {g === 3 && <td className="border border-black px-1">Otros (¿Cuales?): {txt(r.epp_otros)}</td>}
            </tr>
          ))}
        </tbody>
      </table>

      <table className="w-full border-collapse border border-black">
        <colgroup>
          <col className="w-[38%]" />
          <col className="w-[6%]" />
          <col className="w-[6%]" />
          <col className="w-[38%]" />
          <col className="w-[6%]" />
          <col className="w-[6%]" />
        </colgroup>
        <tbody>
          <tr>
            <td colSpan={6} className={barra} style={{ background: SALMON }}>4. LISTA DE CHEQUEO</td>
          </tr>
          <tr className="text-center font-bold" style={{ background: SALMON }}>
            <td className="border border-black">ITEM</td>
            <td className="border border-black">SI</td>
            <td className="border border-black">N/A</td>
            <td className="border border-black">ITEM</td>
            <td className="border border-black">SI</td>
            <td className="border border-black">N/A</td>
          </tr>
          {CHEQUEO.slice(0, 9).map(([id, texto], i) => {
            const [id2, texto2] = CHEQUEO[i + 9];
            return (
              <tr key={id} className="text-center">
                <td className="border border-black px-1 text-left">{texto}</td>
                <td className="border border-black font-bold">{marcaChequeo(id, "SI")}</td>
                <td className="border border-black font-bold">{marcaChequeo(id, "N/A")}</td>
                <td className="border border-black px-1 text-left">{texto2}</td>
                <td className="border border-black font-bold">{marcaChequeo(id2, "SI")}</td>
                <td className="border border-black font-bold">{marcaChequeo(id2, "N/A")}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="salto-pagina" />
      <table className="w-full border-collapse border border-black">
        <colgroup>
          <col className="w-[6%]" />
          <col className="w-[16%]" />
          <col className="w-[10%]" />
          {DIAS.map((x) => (
            <col key={x} className="w-[11.33%]" />
          ))}
        </colgroup>
        <tbody>
          <tr>
            <td colSpan={9} className={barra} style={{ background: SALMON }}>5. FIRMAS AUTORIZACIÓN Y REVALIDACIONES</td>
          </tr>
          <tr>
            <td colSpan={9} className="border border-black px-1">
              <b>Autorizador:</b> he verificado con el ejecutor la aplicación del programa de prevención y protección contra caídas de altura y sus anexos y considero seguro proceder con la ejecución del trabajo.
              {autorizador.length > 0 && (
                <span className="ml-2 inline-flex items-center gap-1 align-middle">
                  {autorizador[0].url && <img src={autorizador[0].url} alt="" className="inline h-5 w-16 object-contain" />}
                  <span>
                    {autorizador[0].nombre} · CC {autorizador[0].documento}
                    {autorizador[0].cargo ? ` · ${autorizador[0].cargo}` : ""} · {ddmmaaaa(diaBogota(autorizador[0].firmadaEn))}
                  </span>
                </span>
              )}
            </td>
          </tr>
          <tr>
            <td colSpan={9} className="border border-black px-1 text-[8px]">
              <b>Ejecutor:</b> he verificado con el autorizador la aplicación del programa de prevención y protección contra caídas de altura y me comprometo a comunicarlos al grupo ejecutor y considero seguro proceder con la ejecución del trabajo.
            </td>
          </tr>
          <tr className="text-center font-bold" style={{ background: AZUL }}>
            <td rowSpan={2} className="border border-black">No</td>
            <td rowSpan={2} className="border border-black">NOMRE Y APELLIDO DEL TRABAJADOR</td>
            <td rowSpan={2} className="border border-black">CEDULA No.</td>
            <td colSpan={6} className="border border-black">FIRMAS</td>
          </tr>
          <tr className="text-center font-bold">
            {DIAS.map((x) => (
              <td key={x} className="border border-black">{x}</td>
            ))}
          </tr>
          {conRenglones(d.tecnicos, 4).map((t, i) => (
            <tr key={i}>
              <td className="border border-black text-center">{i + 1}</td>
              <td className="border border-black px-1">{t?.nombre ?? ""}</td>
              <td className="border border-black px-1 text-center">{t?.documento ?? ""}</td>
              <CeldasDias firmas={t ? ejecutoresFirmas.filter((f) => doc(f.documento) === doc(t.documento)) : []} />
            </tr>
          ))}
          <tr>
            <td colSpan={9} className="whitespace-pre-line border border-black px-1 py-1 text-[11px]">
              <b>Observaciones:</b> {txt(r.observaciones)}
            </td>
          </tr>
        </tbody>
      </table>
      <Domingos firmas={d.firmas} />

      <table className="mt-2 w-full border-collapse border border-black">
        <tbody>
          <tr>
            <td colSpan={2} className={`${barra} text-[11px]`} style={{ background: SALMON }}>6. CIERRE (Coloque SI, NO o NA en cada casilla)</td>
          </tr>
          <tr className="text-center font-bold">
            <td className="w-1/2 border border-black p-1">EJECUTOR: Declaro que</td>
            <td className="border border-black p-1">AUTORIZADOR: He verificado que</td>
          </tr>
          <tr>
            <td className="border border-black px-1 align-top">
              <p>☐ El trabajo ha sido terminado</p>
              <p>☐ El sitio queda en condiciones seguras</p>
              <p>☐ Entregó el área limpia y libre de desechos</p>
              <p className="mt-6 text-center">____________________________<br />NOMBRE Y FIRMA EJECUTOR</p>
            </td>
            <td className="border border-black px-1 align-top">
              <p>☐ El sitio queda en condiciones seguras</p>
              <p>☐ El permiso de trabajo ha sido suspendido definitivamente</p>
              <p className="mt-6 text-center">____________________________<br />NOMBRE Y FIRMA AUTORIZADOR</p>
              <p className="mt-1">DD ____ MM ____ AAAA ______ AM ☐ PM ☐</p>
            </td>
          </tr>
        </tbody>
      </table>
      <p className="mt-1 text-[8px] text-slate-600">El cierre se diligencia a mano al terminar la semana (el contenido del permiso quedó sellado con la primera firma).</p>
    </div>
  );
}
