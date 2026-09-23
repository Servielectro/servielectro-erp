// Motor de precios de cotización. Mismas fórmulas que
// supabase/migrations/20260923000004_cotizaciones.sql y 20260923000006_vistas_analiticas.sql —
// si se cambia una fórmula acá, cambiarla también allá.

export type Categoria = "EQUIPO" | "MATERIAL" | "MANO_DE_OBRA";
export type EsquemaIva = "IVA_FULL" | "IVA_AIU";

export interface LineaCotizacion {
  id: string;
  categoria: Categoria;
  itemCatalogoId: string | null;
  descripcion: string;
  unidad: string;
  cantidad: number;
  valorCompraUnitario: number;
  factorRentabilidadLinea: number;
}

export interface ConfigPrecio {
  esquemaIva: EsquemaIva;
  factorRecargoProyecto: number;
  pctAdmin: number;
  pctImprevistos: number;
  pctUtilidadAiu: number;
  ivaPct: number;
}

export const CONFIG_PRECIO_DEFAULT: ConfigPrecio = {
  esquemaIva: "IVA_FULL",
  factorRecargoProyecto: 1,
  pctAdmin: 0.05,
  pctImprevistos: 0.06,
  pctUtilidadAiu: 0.05,
  ivaPct: 0.19,
};

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function calcularVentaUnitario(
  compra: number,
  factorRentabilidad: number,
): number {
  if (!factorRentabilidad) return 0;
  return round2(compra / factorRentabilidad);
}

export function calcularCalculoUnitario(
  venta: number,
  factorRecargo: number,
): number {
  if (!factorRecargo) return 0;
  return round2(venta / factorRecargo);
}

export interface LineaCalculada extends LineaCotizacion {
  valorVentaUnitario: number;
  valorCalculoUnitario: number;
  subtotalCompra: number;
  subtotalVenta: number;
  subtotalCalculo: number;
}

export function calcularLinea(
  linea: LineaCotizacion,
  factorRecargoProyecto: number,
): LineaCalculada {
  const valorVentaUnitario = calcularVentaUnitario(
    linea.valorCompraUnitario,
    linea.factorRentabilidadLinea,
  );
  const valorCalculoUnitario = calcularCalculoUnitario(
    valorVentaUnitario,
    factorRecargoProyecto,
  );
  return {
    ...linea,
    valorVentaUnitario,
    valorCalculoUnitario,
    subtotalCompra: round2(linea.valorCompraUnitario * linea.cantidad),
    subtotalVenta: round2(valorVentaUnitario * linea.cantidad),
    subtotalCalculo: round2(valorCalculoUnitario * linea.cantidad),
  };
}

export interface TotalesCotizacion {
  lineas: LineaCalculada[];
  subtotalCompra: number;
  subtotalVenta: number;
  subtotalCalculo: number;
  valorAdmin: number;
  valorImprevistos: number;
  valorUtilidadAiu: number;
  subtotalGeneral: number;
  ivaBaseMotivo: string;
  ivaBaseValor: number;
  valorIva: number;
  total: number;
}

export function calcularTotales(
  lineasCrudas: LineaCotizacion[],
  config: ConfigPrecio,
): TotalesCotizacion {
  const lineas = lineasCrudas.map((l) =>
    calcularLinea(l, config.factorRecargoProyecto),
  );

  const subtotalCompra = round2(
    lineas.reduce((acc, l) => acc + l.subtotalCompra, 0),
  );
  const subtotalVenta = round2(
    lineas.reduce((acc, l) => acc + l.subtotalVenta, 0),
  );
  const subtotalCalculo = round2(
    lineas.reduce((acc, l) => acc + l.subtotalCalculo, 0),
  );

  const valorAdmin = round2(subtotalCalculo * config.pctAdmin);
  const valorImprevistos = round2(subtotalCalculo * config.pctImprevistos);
  const valorUtilidadAiu = round2(subtotalCalculo * config.pctUtilidadAiu);
  const subtotalGeneral = round2(
    subtotalCalculo + valorAdmin + valorImprevistos + valorUtilidadAiu,
  );

  const esAiu = config.esquemaIva === "IVA_AIU";
  const ivaBaseValor = esAiu ? valorUtilidadAiu : subtotalGeneral;
  const ivaBaseMotivo = esAiu
    ? "UTILIDAD_AIU (esquema IVA AIU elegido en la cotización)"
    : "SUBTOTAL_GENERAL (esquema IVA FULL elegido en la cotización)";

  const valorIva = round2(ivaBaseValor * config.ivaPct);
  const total = round2(subtotalGeneral + valorIva);

  return {
    lineas,
    subtotalCompra,
    subtotalVenta,
    subtotalCalculo,
    valorAdmin,
    valorImprevistos,
    valorUtilidadAiu,
    subtotalGeneral,
    ivaBaseMotivo,
    ivaBaseValor,
    valorIva,
    total,
  };
}

export function formatCOP(valor: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(valor);
}

export const FACTORES_RENTABILIDAD_DEFAULT: Record<Categoria, number> = {
  EQUIPO: 0.85,
  MATERIAL: 0.88,
  MANO_DE_OBRA: 0.8,
};

export const UNIDADES_SUGERIDAS = ["UNI", "GL", "ML", "M2", "M3", "HR", "GLB"];
