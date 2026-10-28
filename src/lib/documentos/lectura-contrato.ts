// Lectura de un contrato con IA (migración 102) y COMPARACIÓN entre dos: "qué me cambiaron". La IA
// lee cada documento una vez y su lectura se guarda; la comparación de aquí es determinista. Si el
// documento es el contrato firmado y su registro de la 93 está confirmado, se compara contra lo
// confirmado (lo que revisó una persona), no contra la lectura.

export interface Cita {
  pagina?: number | null;
  cita?: string | null;
}
export interface LecturaContrato {
  valor_total: { valor: number | null } & Cita;
  forma_pago: { concepto: string; porcentaje: number | null; valor: number | null; condicion: string | null }[];
  plazo_ejecucion: { cantidad: number | null; unidad: string | null; inicia: string | null } & Cita;
  plazo_pago: { cantidad: number | null; unidad: string | null } & Cita;
  multa: { valor_diario: number | null; porcentaje_diario?: number | null; unidad: string | null; tope_pct: number | null; texto: string | null } & Cita;
  garantias: { concepto: string; duracion: string; desde: string | null }[];
  prorrogas: { automatica: boolean | null; causales_aceptadas: string[]; causales_excluidas: string[] } & Cita;
  polizas_exigidas: { amparo: string; porcentaje: number | null; vigencia: string | null }[];
  clausulas: { numero: string; titulo: string }[];
  /** Lo que la IA dice que no pudo leer (páginas que faltan, ilegible). */
  advertencias: string[];
}

const num = { type: ["number", "null"] };
const txt = { type: ["string", "null"] };
const cita = { pagina: { type: ["integer", "null"] }, cita: txt };
export const ESQUEMA_LECTURA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["valor_total", "forma_pago", "plazo_ejecucion", "plazo_pago", "multa", "garantias", "prorrogas", "polizas_exigidas", "clausulas", "advertencias"],
  properties: {
    valor_total: { type: "object", properties: { valor: num, ...cita } },
    forma_pago: {
      type: "array",
      items: { type: "object", properties: { concepto: { type: "string" }, porcentaje: num, valor: num, condicion: txt } },
    },
    plazo_ejecucion: { type: "object", properties: { cantidad: num, unidad: txt, inicia: txt, ...cita } },
    plazo_pago: { type: "object", properties: { cantidad: num, unidad: txt, ...cita } },
    multa: { type: "object", properties: { valor_diario: num, porcentaje_diario: num, unidad: txt, tope_pct: num, texto: txt, ...cita } },
    garantias: {
      type: "array",
      items: { type: "object", properties: { concepto: { type: "string" }, duracion: { type: "string" }, desde: txt } },
    },
    prorrogas: {
      type: "object",
      properties: {
        automatica: { type: ["boolean", "null"] },
        causales_aceptadas: { type: "array", items: { type: "string" } },
        causales_excluidas: { type: "array", items: { type: "string" } },
        ...cita,
      },
    },
    polizas_exigidas: {
      type: "array",
      items: { type: "object", properties: { amparo: { type: "string" }, porcentaje: num, vigencia: txt } },
    },
    clausulas: { type: "array", items: { type: "object", properties: { numero: { type: "string" }, titulo: { type: "string" } } } },
    advertencias: { type: "array", items: { type: "string" } },
  },
};

export const INSTRUCCIONES_LECTURA = `Eres un asistente que LEE un contrato de obra o de servicios en español (Colombia) y extrae datos.
Reglas:
- Solo lo que el documento dice. Si un dato no aparece, null (o lista vacía). No completes con lo "normal" ni con lo de otro contrato.
- Valores en pesos como número sin puntos ni signo (16970535). Porcentajes como número (50).
- forma_pago: un renglón por cada pago (anticipo, pagos parciales, pago final, retención de garantía), en el orden del contrato, con su condición tal como la dice.
- plazo_ejecucion.unidad: "dias_habiles", "dias_calendario", "semanas" o "meses". inicia: desde cuándo se cuenta, en pocas palabras.
- plazo_pago: en cuánto tiempo se paga cada cuenta después de radicada (por ejemplo 5 días hábiles).
- multa: valor_diario en pesos si la da en pesos; porcentaje_diario si la da como porcentaje por día (del valor del contrato o de lo pendiente); unidad "dia_habil" o "dia_calendario"; tope_pct: el tope total en porcentaje; texto: sobre qué se calcula y cuándo aplica, en una frase.
- garantias: cada garantía (equipos, materiales, mano de obra, accesorios…) con su duración y desde cuándo.
- prorrogas: automatica = true si el contrato prevé prórroga o ampliación automática del plazo por ciertas causas, false si dice que NO hay prórrogas automáticas, null si no dice nada. causales_aceptadas: las causas que el contrato acepta para ampliar el plazo. causales_excluidas: las que expresamente NO dan derecho a ampliación.
- clausulas: el número y el título de CADA cláusula, en orden (PRIMERA. OBJETO…). Sirve para ver si una versión tiene cláusulas que la otra no.
- pagina y cita: la página (desde 1) y una cita textual corta (menos de 25 palabras) de donde sacaste el dato.
- advertencias: si faltan páginas, se corta el texto entre una página y otra, o algo no se puede leer, dilo aquí con la página.`;

// ------------------------------------------------------------------ comparación

export interface FilaComparacion {
  campo: string;
  a: string[];
  b: string[];
  distinto: boolean;
  /** Las citas para ir a mirar el documento. */
  citaA?: string | null;
  citaB?: string | null;
}

const pesos = (n: number | null | undefined) => (n === null || n === undefined ? "—" : `$${Math.round(n).toLocaleString("es-CO")}`);
const pct = (n: number | null | undefined) => (n === null || n === undefined ? "" : `${n}%`);
const norm = (s: string | null | undefined) =>
  (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9%]+/g, " ").trim();
const UNIDAD: Record<string, string> = { dias_habiles: "días hábiles", dias_calendario: "días calendario", semanas: "semanas", meses: "meses", dia_habil: "por día hábil", dia_calendario: "por día calendario" };
const unidad = (u: string | null | undefined) => (u ? UNIDAD[u] ?? u : "");
const conCita = (c: Cita | undefined) => (c && (c.cita || c.pagina) ? `${c.pagina ? `pág. ${c.pagina}: ` : ""}${c.cita ? `“${c.cita}”` : ""}` : null);
/** Un número en un texto ("12 meses" → 12), para comparar duraciones sin depender de la redacción. */
const numeros = (s: string | null | undefined) => (s ?? "").match(/\d+([.,]\d+)?/g)?.join("/") ?? "";

function fila(campo: string, a: string[], b: string[], igual: boolean, ca?: Cita, cb?: Cita): FilaComparacion {
  return { campo, a: a.length ? a : ["—"], b: b.length ? b : ["—"], distinto: !igual, citaA: conCita(ca), citaB: conCita(cb) };
}
const mismoConjunto = (x: string[], y: string[]) => x.length === y.length && [...x].sort().join("|") === [...y].sort().join("|");

/** La comparación campo por campo. `a` = lo que se envió, `b` = lo que se firmó. */
export function comparar(a: LecturaContrato, b: LecturaContrato): FilaComparacion[] {
  const filas: FilaComparacion[] = [];
  filas.push(fila("Valor total", [pesos(a.valor_total?.valor)], [pesos(b.valor_total?.valor)],
    Math.round(a.valor_total?.valor ?? -1) === Math.round(b.valor_total?.valor ?? -1), a.valor_total, b.valor_total));

  const pago = (l: LecturaContrato) => (l.forma_pago ?? []).map((p) => `${pct(p.porcentaje)} ${pesos(p.valor)} · ${p.concepto}${p.condicion ? ` — ${p.condicion}` : ""}`);
  const clavePago = (l: LecturaContrato) => (l.forma_pago ?? []).map((p) => `${p.porcentaje ?? ""}:${p.valor === null || p.valor === undefined ? "" : Math.round(p.valor)}`);
  filas.push(fila("Forma de pago", pago(a), pago(b), clavePago(a).join("|") === clavePago(b).join("|")));

  const plazo = (l: LecturaContrato) => (l.plazo_ejecucion?.cantidad ? [`${l.plazo_ejecucion.cantidad} ${unidad(l.plazo_ejecucion.unidad)}${l.plazo_ejecucion.inicia ? `, desde ${l.plazo_ejecucion.inicia}` : ""}`] : []);
  filas.push(fila("Plazo de ejecución", plazo(a), plazo(b),
    a.plazo_ejecucion?.cantidad === b.plazo_ejecucion?.cantidad && a.plazo_ejecucion?.unidad === b.plazo_ejecucion?.unidad, a.plazo_ejecucion, b.plazo_ejecucion));

  const pp = (l: LecturaContrato) => (l.plazo_pago?.cantidad ? [`${l.plazo_pago.cantidad} ${unidad(l.plazo_pago.unidad)}`] : []);
  filas.push(fila("Plazo de pago de cada cuenta", pp(a), pp(b),
    a.plazo_pago?.cantidad === b.plazo_pago?.cantidad && a.plazo_pago?.unidad === b.plazo_pago?.unidad, a.plazo_pago, b.plazo_pago));

  const multa = (l: LecturaContrato) => {
    const m = l.multa;
    if (!m || (m.valor_diario === null && !m.porcentaje_diario && m.tope_pct === null && !m.texto)) return [];
    return [[m.valor_diario !== null ? `${pesos(m.valor_diario)} ${unidad(m.unidad)}` : "", m.porcentaje_diario ? `${m.porcentaje_diario}% ${unidad(m.unidad)}` : "", m.tope_pct !== null ? `tope ${m.tope_pct}%` : "", m.texto ?? ""].filter(Boolean).join(" · ")];
  };
  filas.push(fila("Multa", multa(a), multa(b),
    (a.multa?.valor_diario ?? null) === (b.multa?.valor_diario ?? null) && (a.multa?.porcentaje_diario ?? null) === (b.multa?.porcentaje_diario ?? null) && (a.multa?.tope_pct ?? null) === (b.multa?.tope_pct ?? null) && (a.multa?.unidad ?? null) === (b.multa?.unidad ?? null),
    a.multa, b.multa));

  const gar = (l: LecturaContrato) => (l.garantias ?? []).map((g) => `${g.concepto}: ${g.duracion}${g.desde ? ` desde ${g.desde}` : ""}`);
  const claveGar = (l: LecturaContrato) => (l.garantias ?? []).map((g) => `${norm(g.concepto)}=${numeros(g.duracion)}`);
  filas.push(fila("Garantías", gar(a), gar(b), mismoConjunto(claveGar(a), claveGar(b))));

  const auto = (l: LecturaContrato) => [l.prorrogas?.automatica === true ? "Sí, por las causales de abajo" : l.prorrogas?.automatica === false ? "NO hay prórrogas automáticas" : "No dice"];
  filas.push(fila("Prórroga automática del plazo", auto(a), auto(b), (a.prorrogas?.automatica ?? null) === (b.prorrogas?.automatica ?? null), a.prorrogas, b.prorrogas));
  filas.push(fila("Causales de prórroga aceptadas", a.prorrogas?.causales_aceptadas ?? [], b.prorrogas?.causales_aceptadas ?? [],
    (a.prorrogas?.causales_aceptadas ?? []).length === (b.prorrogas?.causales_aceptadas ?? []).length));
  filas.push(fila("Causales excluidas expresamente", a.prorrogas?.causales_excluidas ?? [], b.prorrogas?.causales_excluidas ?? [],
    (a.prorrogas?.causales_excluidas ?? []).length === (b.prorrogas?.causales_excluidas ?? []).length));

  const pol = (l: LecturaContrato) => (l.polizas_exigidas ?? []).map((p) => `${p.amparo} ${pct(p.porcentaje)}${p.vigencia ? ` · ${p.vigencia}` : ""}`);
  const clavePol = (l: LecturaContrato) => (l.polizas_exigidas ?? []).map((p) => `${norm(p.amparo).split(" ")[0]}=${p.porcentaje ?? ""}`);
  filas.push(fila("Pólizas exigidas", pol(a), pol(b), mismoConjunto(clavePol(a), clavePol(b))));

  // Cláusulas: por título (la numeración se corre si se agrega una en el medio).
  const titulos = (l: LecturaContrato) => new Map((l.clausulas ?? []).map((c) => [norm(c.titulo), `${c.numero}. ${c.titulo}`]));
  const ta = titulos(a);
  const tb = titulos(b);
  const soloA = [...ta.entries()].filter(([k]) => !tb.has(k)).map(([, v]) => v);
  const soloB = [...tb.entries()].filter(([k]) => !ta.has(k)).map(([, v]) => v);
  filas.push(fila("Cláusulas que solo están en uno", soloA, soloB, soloA.length === 0 && soloB.length === 0));
  return filas;
}

/**
 * El contrato confirmado (migración 93) encima de la lectura del mismo documento: lo que la 93
 * tiene (valor, pagos, plazo, multa, garantías, pólizas) sale de lo confirmado; lo que no tiene
 * (plazo de pago, prórrogas, cláusulas) sigue saliendo de la lectura.
 */
export function lecturaDesdeConfirmado(c: {
  valor_total: number | null;
  forma_pago: { concepto: string; porcentaje?: number | null; valor?: number | null; condicion?: string | null }[];
  plazo_cantidad: number | null;
  plazo_unidad: string | null;
  plazo_inicia: string | null;
  plazo_inicia_detalle: string | null;
  multa_diaria: number | null;
  multa_unidad: string | null;
  multa_tope_pct: number | null;
  garantias: { concepto: string; duracion: string; desde?: string | null }[];
  polizas_exigidas: { amparo: string; porcentaje?: number | null; vigencia?: string | null }[];
}, base: LecturaContrato | null): LecturaContrato {
  return {
    valor_total: { valor: c.valor_total },
    forma_pago: (c.forma_pago ?? []).map((p) => ({ concepto: p.concepto, porcentaje: p.porcentaje ?? null, valor: p.valor ?? null, condicion: p.condicion ?? null })),
    plazo_ejecucion: { cantidad: c.plazo_cantidad, unidad: c.plazo_unidad, inicia: c.plazo_inicia_detalle ?? c.plazo_inicia },
    plazo_pago: base?.plazo_pago ?? { cantidad: null, unidad: null },
    multa: { valor_diario: c.multa_diaria, porcentaje_diario: base?.multa?.porcentaje_diario ?? null, unidad: c.multa_unidad, tope_pct: c.multa_tope_pct, texto: base?.multa?.texto ?? null },
    garantias: (c.garantias ?? []).map((g) => ({ concepto: g.concepto, duracion: g.duracion, desde: g.desde ?? null })),
    prorrogas: base?.prorrogas ?? { automatica: null, causales_aceptadas: [], causales_excluidas: [] },
    polizas_exigidas: (c.polizas_exigidas ?? []).map((p) => ({ amparo: p.amparo, porcentaje: p.porcentaje ?? null, vigencia: p.vigencia ?? null })),
    clausulas: base?.clausulas ?? [],
    advertencias: base?.advertencias ?? [],
  };
}
