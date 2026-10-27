// Clientes en Administrativo (migración 70): los datos DIAN, las sedes y la importación del
// Excel de SIIGO. Las reglas que importan (DV, campos importables, no borrar lo que SIIGO no
// trae) viven en la base; esto es lo que la pantalla necesita para decirlas antes de guardar.

export const TIPOS_DOCUMENTO_DIAN: { codigo: string; nombre: string }[] = [
  { codigo: "13", nombre: "Cédula de ciudadanía" },
  { codigo: "31", nombre: "NIT" },
  { codigo: "22", nombre: "Cédula de extranjería" },
  { codigo: "41", nombre: "Pasaporte" },
  { codigo: "42", nombre: "Documento de identificación extranjero" },
  { codigo: "50", nombre: "NIT de otro país" },
  { codigo: "47", nombre: "PEP (permiso especial de permanencia)" },
  { codigo: "48", nombre: "PPT (permiso por protección temporal)" },
  { codigo: "21", nombre: "Tarjeta de extranjería" },
  { codigo: "12", nombre: "Tarjeta de identidad" },
  { codigo: "11", nombre: "Registro civil" },
  { codigo: "91", nombre: "NUIP" },
];
export const TIPO_DOCUMENTO_DIAN = Object.fromEntries(TIPOS_DOCUMENTO_DIAN.map((t) => [t.codigo, t.nombre])) as Record<string, string>;

export type TipoPersona = "natural" | "juridica";
export const TIPO_PERSONA: Record<TipoPersona, string> = { natural: "Persona natural", juridica: "Persona jurídica" };

/**
 * Responsabilidades fiscales (migración 80): dos codificaciones de la DIAN, cada una en su columna.
 *   - responsabilidades_rut: códigos numéricos de la casilla 53 del RUT ("07", "42", "55"), tal
 *     como vienen del RUT. Todos, estén o no en el catálogo.
 *   - responsabilidades_fe: los de la factura electrónica ("O-13", "R-99-PN"), los que exporta SIIGO.
 * Los nombres salen del catálogo responsabilidades_fiscales (src/lib/rut/catalogos.ts), no de aquí.
 */
export const ES_CODIGO_FE = /^[A-Z]-\d{2}(-[A-Z]{2})?$/;

export interface ClienteFicha {
  id: string;
  nombre: string;
  nit: string | null;
  dv: string | null;
  tipo_documento: string | null;
  tipo_persona: TipoPersona | null;
  tipo_contribuyente: string | null;
  email: string | null;
  email_encargado_proyecto: string | null;
  contacto: string | null;
  telefono: string | null;
  direccion: string | null;
  municipio: string | null;
  departamento: string | null;
  municipio_dane: string | null;
  responsable_iva: boolean | null;
  responsabilidades_rut: string[] | null;
  responsabilidades_fe: string[] | null;
  declarante_renta: boolean | null;
  notas: string | null;
  activo: boolean;
  latitud: number | null;
  longitud: number | null;
  actualizado_desde_siigo_en: string | null;
}
export const COLUMNAS_CLIENTE =
  "id, nombre, nit, dv, tipo_documento, tipo_persona, tipo_contribuyente, email, email_encargado_proyecto, contacto, telefono, direccion, municipio, departamento, municipio_dane, responsable_iva, responsabilidades_rut, responsabilidades_fe, declarante_renta, notas, activo, latitud, longitud, actualizado_desde_siigo_en";

export interface Sede {
  id: string;
  cliente_id: string;
  nombre: string;
  direccion: string | null;
  municipio: string | null;
  municipio_dane: string | null;
  contacto: string | null;
  telefono: string | null;
  email: string | null;
  latitud: number | null;
  longitud: number | null;
  notas: string | null;
  activa: boolean;
}
export const COLUMNAS_SEDE = "id, cliente_id, nombre, direccion, municipio, municipio_dane, contacto, telefono, email, latitud, longitud, notas, activa";

/** Lo que le falta a la ficha para facturar electrónicamente (lo que pide la DIAN). */
export function faltanParaFacturar(c: Pick<ClienteFicha, "nit" | "tipo_documento" | "email" | "municipio_dane" | "responsabilidades_fe">): string[] {
  const f: string[] = [];
  if (!c.tipo_documento) f.push("tipo de documento");
  if (!c.nit) f.push("NIT o documento");
  if (!c.email) f.push("correo de facturación");
  if (!c.municipio_dane) f.push("código DANE del municipio");
  if (!c.responsabilidades_fe?.length) f.push("responsabilidad fiscal para la factura electrónica (mínimo R-99-PN)");
  return f;
}

/** Solo los dígitos antes del guion (lo mismo que fn_nit_base en la base). */
export function nitBase(nit: string | null | undefined): string | null {
  if (!nit) return null;
  const d = nit.split("-")[0].replace(/\D/g, "");
  return d || null;
}

/** DV del NIT, algoritmo de la DIAN (el mismo de fn_dv_nit). */
export function dvNit(nit: string | null | undefined): string | null {
  const v = nitBase(nit);
  if (!v || v.length > 15) return null;
  const pesos = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];
  let suma = 0;
  for (let i = 0; i < v.length; i++) suma += Number(v[v.length - 1 - i]) * pesos[i];
  const r = suma % 11;
  return String(r < 2 ? r : 11 - r);
}

export function nitConDv(c: Pick<ClienteFicha, "nit" | "dv">): string {
  if (!c.nit) return "—";
  return c.dv ? `${c.nit}-${c.dv}` : c.nit;
}

// ------------------------------------------------------------------ importación de SIIGO

/** Los campos que la base acepta importar (la misma lista de fn_importar_clientes). */
export type CampoImportable =
  | "nombre"
  | "nit"
  | "dv"
  | "tipo_documento"
  | "tipo_persona"
  | "email"
  | "email_encargado_proyecto"
  | "contacto"
  | "telefono"
  | "direccion"
  | "municipio"
  | "departamento"
  | "municipio_dane"
  | "tipo_contribuyente"
  | "responsable_iva"
  | "responsabilidades_rut"
  | "responsabilidades_fe"
  | "declarante_renta"
  | "notas";

/**
 * Para cada campo: el nombre en pantalla y los encabezados con que se SUGIERE el emparejamiento.
 * Es solo una sugerencia: la persona confirma columna por columna antes de ver nada.
 */
export const CAMPOS_IMPORTABLES: { id: CampoImportable; nombre: string; parecidos: string[] }[] = [
  { id: "nombre", nombre: "Nombre / razón social", parecidos: ["nombre", "razon social", "nombre tercero", "nombre completo", "cliente", "tercero"] },
  { id: "nit", nombre: "NIT / identificación", parecidos: ["nit", "identificacion", "numero identificacion", "documento", "numero de documento", "cedula", "nit cliente"] },
  { id: "dv", nombre: "DV", parecidos: ["dv", "digito verificacion", "digito de verificacion"] },
  { id: "tipo_documento", nombre: "Tipo de documento (DIAN)", parecidos: ["tipo identificacion", "tipo documento", "tipo de identificacion", "tipo de documento"] },
  { id: "tipo_persona", nombre: "Tipo de persona", parecidos: ["tipo persona", "tipo de persona", "tipo tercero", "persona"] },
  { id: "email", nombre: "Correo de facturación", parecidos: ["correo", "email", "e mail", "correo electronico", "correo factura electronica", "email facturacion"] },
  { id: "email_encargado_proyecto", nombre: "Correo del encargado de proyecto", parecidos: ["correo encargado", "email encargado", "correo proyecto"] },
  { id: "contacto", nombre: "Persona de contacto", parecidos: ["contacto", "nombre contacto", "persona contacto"] },
  { id: "telefono", nombre: "Teléfono", parecidos: ["telefono", "celular", "telefono 1", "telefonos", "movil"] },
  { id: "direccion", nombre: "Dirección", parecidos: ["direccion", "direccion principal"] },
  { id: "municipio", nombre: "Municipio (nombre)", parecidos: ["ciudad", "municipio", "nombre ciudad"] },
  { id: "departamento", nombre: "Departamento", parecidos: ["departamento", "depto"] },
  { id: "municipio_dane", nombre: "Código DANE del municipio", parecidos: ["codigo ciudad", "codigo municipio", "codigo dane", "dane", "cod ciudad"] },
  { id: "tipo_contribuyente", nombre: "Tipo de contribuyente", parecidos: ["tipo contribuyente", "regimen"] },
  { id: "responsable_iva", nombre: "Responsable de IVA (sí/no)", parecidos: ["responsable iva", "responsable de iva", "regimen iva"] },
  { id: "responsabilidades_fe", nombre: "Responsabilidades para factura electrónica (O-13, R-99-PN…)", parecidos: ["responsabilidad fiscal", "responsabilidades fiscales", "responsabilidades", "responsabilidad"] },
  { id: "responsabilidades_rut", nombre: "Responsabilidades del RUT (casilla 53, códigos numéricos)", parecidos: ["responsabilidades rut", "casilla 53", "responsabilidades del rut"] },
  { id: "declarante_renta", nombre: "Declarante de renta (sí/no)", parecidos: ["declarante", "declarante renta", "declarante de renta"] },
  { id: "notas", nombre: "Notas", parecidos: ["observaciones", "notas", "comentarios"] },
];
export const NOMBRE_CAMPO = Object.fromEntries(CAMPOS_IMPORTABLES.map((c) => [c.id, c.nombre])) as Record<CampoImportable, string>;

export function normalizarTexto(t: string): string {
  return t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Sugerencia de emparejamiento por el encabezado. Null = no se parece a ningún campo. */
export function sugerirCampo(encabezado: string, yaUsados: Set<CampoImportable>): CampoImportable | null {
  const e = normalizarTexto(encabezado);
  if (!e) return null;
  for (const c of CAMPOS_IMPORTABLES) {
    if (yaUsados.has(c.id)) continue;
    if (c.parecidos.some((p) => e === p)) return c.id;
  }
  for (const c of CAMPOS_IMPORTABLES) {
    if (yaUsados.has(c.id)) continue;
    if (c.parecidos.some((p) => p.length > 3 && e.includes(p))) return c.id;
  }
  return null;
}

export type ValorImportado = string | boolean | string[];

/**
 * Pasa lo que trae una celda al formato del campo. Devuelve { valor } (null = celda vacía: no
 * cambia nada) o { error } con la frase que se muestra en la vista previa.
 */
export function leerCelda(campo: CampoImportable, crudo: unknown): { valor: ValorImportado | null } | { error: string } {
  const t = crudo === null || crudo === undefined ? "" : String(crudo).trim();
  if (!t) return { valor: null };
  const n = normalizarTexto(t);
  switch (campo) {
    case "tipo_documento": {
      const codigo = t.match(/^\d{2}\b/)?.[0];
      if (codigo && TIPO_DOCUMENTO_DIAN[codigo]) return { valor: codigo };
      const porNombre: [RegExp, string][] = [
        [/^nit( de otro pais)?$|^nit\b/, n.includes("otro pais") ? "50" : "31"],
        [/cedula de extranjeria|^ce$/, "22"],
        [/cedula|^cc$/, "13"],
        [/pasaporte|^pa$/, "41"],
        [/tarjeta de identidad|^ti$/, "12"],
        [/tarjeta de extranjeria/, "21"],
        [/registro civil/, "11"],
        [/\bpep\b|permiso especial/, "47"],
        [/\bppt\b|proteccion temporal/, "48"],
        [/nuip/, "91"],
        [/extranjer/, "42"],
      ];
      const hallado = porNombre.find(([re]) => re.test(n));
      return hallado ? { valor: hallado[1] } : { error: `“${t}” no es un tipo de documento DIAN conocido` };
    }
    case "tipo_persona":
      if (/natural/.test(n)) return { valor: "natural" };
      if (/juridica|empresa|sociedad/.test(n)) return { valor: "juridica" };
      return { error: `“${t}”: se esperaba persona natural o jurídica` };
    case "responsable_iva":
    case "declarante_renta":
      if (/^(si|s|x|true|1|verdadero|responsable)$/.test(n) || n.startsWith("si ")) return { valor: true };
      if (/^(no|n|false|0|falso|no responsable)$/.test(n) || n.startsWith("no ")) return { valor: false };
      return { error: `“${t}”: se esperaba sí o no` };
    case "responsabilidades_rut": {
      // Casilla 53 del RUT: códigos numéricos. Un "O-13" aquí es de factura electrónica: otro campo.
      const codigos = t.split(/[;,/|\s]+/).map((p) => p.trim()).filter(Boolean);
      const fe = codigos.filter((c) => ES_CODIGO_FE.test(c.toUpperCase()));
      if (fe.length) return { error: `“${fe.join(", ")}” son códigos de factura electrónica: empareja esa columna con “Responsabilidades para factura electrónica”` };
      const malos = codigos.filter((c) => !/^\d{1,3}$/.test(c));
      return malos.length ? { error: `“${malos.join(", ")}” no parece un código de la casilla 53 del RUT` } : { valor: [...new Set(codigos.map((c) => c.padStart(2, "0")))] };
    }
    case "responsabilidades_fe": {
      // Factura electrónica, tal cual ("O-13", "R-99-PN"). SIIGO a veces los escribe "O13" o con espacios.
      const codigos = t
        .split(/[;,/|]+|\s+(?=[OoRr]-?\d)/)
        .map((p) => p.trim().toUpperCase().replace(/^([OR])-?(\d{2})(-?PN)?$/, (_m, l, n, pn) => `${l}-${n}${pn ? "-PN" : ""}`))
        .filter(Boolean);
      const malos = codigos.filter((c) => !ES_CODIGO_FE.test(c));
      return malos.length ? { error: `“${malos.join(", ")}” no parece un código de factura electrónica (O-13, O-15, O-23, O-47, R-99-PN)` } : { valor: [...new Set(codigos)] };
    }
    case "municipio_dane": {
      const d = t.replace(/\D/g, "");
      // Excel le quita el cero a los de Antioquia, Atlántico…: 5001 → 05001.
      if (d.length === 4) return { valor: "0" + d };
      return d.length === 5 ? { valor: d } : { error: `“${t}”: el código DANE son 5 dígitos (ej. 11001 Bogotá)` };
    }
    case "dv":
      return /^\d$/.test(t) ? { valor: t } : { error: `“${t}”: el DV es un solo dígito` };
    case "nit": {
      const limpio = t.replace(/[.\s]/g, "");
      return /^\d+(-\d)?$/.test(limpio) ? { valor: limpio } : { error: `“${t}”: el NIT o documento debe tener solo números (y el DV con guion)` };
    }
    case "email":
    case "email_encargado_proyecto":
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t) ? { valor: t } : { error: `“${t}” no parece un correo` };
    default:
      return { valor: t };
  }
}
