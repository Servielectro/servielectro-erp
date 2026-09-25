// Motor de precios de cotización. Mismas fórmulas que
// supabase/migrations/20260923000004_cotizaciones.sql, 20260923000006_vistas_analiticas.sql
// y 20260923000012_factor_recargo_iterativo.sql — si se cambia una fórmula acá, cambiarla
// también allá.
//
// El factor de recargo de proyecto y los gastos internos (admin/renta/ICA/comisión) están
// verificados exactos contra el proyecto real Tintalá (2026-09-23) — ver
// docs/ERP-Servielectro-Modulo1-Proyectos.md §13 para el detalle de cada fórmula y qué
// queda todavía sin confirmar (comisión comercial, y el caso IVA_FULL para renta).

export type Categoria = "EQUIPO" | "MATERIAL" | "MANO_DE_OBRA";
export type EsquemaIva = "IVA_FULL" | "IVA_AIU";

export interface LineaCotizacion {
  id: string;
  categoria: Categoria;
  itemCatalogoId: string | null;
  /** Nombre corto — lo que se ve en pantalla mientras se cotiza. */
  descripcion: string;
  /** Descripción larga — solo para el documento del cliente (null si no hay). */
  descripcionLarga: string | null;
  unidad: string;
  cantidad: number;
  valorCompraUnitario: number;
  factorRentabilidadLinea: number;
}

export interface ConfigPrecio {
  esquemaIva: EsquemaIva;
  // AIU (editable por cotización)
  pctAdmin: number;
  pctImprevistos: number;
  pctUtilidadAiu: number;
  // Gastos internos: admin y comisión son configurables por cotización;
  // renta, ICA e IVA son tasas fijas de la empresa (no se modifican por cotización).
  pctAdminGasto: number;
  pctComision: number;
  pctRenta: number;
  icaPorMil: number;
  ivaPct: number;
}

export const CONFIG_PRECIO_DEFAULT: ConfigPrecio = {
  esquemaIva: "IVA_FULL",
  pctAdmin: 0.05,
  pctImprevistos: 0.06,
  pctUtilidadAiu: 0.05,
  pctAdminGasto: 0.14,
  pctComision: 0,
  pctRenta: 0.36,
  icaPorMil: 12.05,
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

/**
 * Factor de recargo de proyecto, por iteración de punto fijo: el factor depende del total
 * del proyecto con IVA, que a su vez depende del factor (para pasar de Venta a Cálculo).
 * Verificado contra Tintalá: converge a 0.8852934706 (real: 0.8852934680) en ~13 vueltas.
 */
export function calcularFactorRecargo(
  compraTotal: number,
  ventaTotal: number,
  config: ConfigPrecio,
): number {
  if (!ventaTotal) return 1;

  const adminVenta = config.pctAdmin * ventaTotal;
  const imprevistosVenta = config.pctImprevistos * ventaTotal;
  const utilidadVenta = config.pctUtilidadAiu * ventaTotal;
  const subtotalGeneralVenta =
    ventaTotal + adminVenta + imprevistosVenta + utilidadVenta;

  const gastoAdmin = config.pctAdminGasto * compraTotal;

  // Renta: sobre la utilidad AIU si el esquema es IVA_AIU, sobre la utilidad total (las 3
  // capas del AIU combinadas) si es IVA_FULL. El caso IVA_AIU está confirmado con Tintalá;
  // IVA_FULL sigue el mismo patrón de nombres pero no está verificado con un ejemplo real.
  const rentaBase =
    config.esquemaIva === "IVA_AIU"
      ? utilidadVenta
      : subtotalGeneralVenta - ventaTotal;
  const gastoRenta = config.pctRenta * rentaBase;
  const gastoIca = (config.icaPorMil / 1000) * subtotalGeneralVenta;

  let factor = 1;
  for (let i = 0; i < 30; i++) {
    const calculoSubtotal = ventaTotal / factor;
    const subtotalGeneralCalculo =
      calculoSubtotal *
      (1 + config.pctAdmin + config.pctImprevistos + config.pctUtilidadAiu);
    const utilidadCalculo = config.pctUtilidadAiu * calculoSubtotal;

    const ivaCalculo =
      config.esquemaIva === "IVA_AIU"
        ? config.ivaPct * utilidadCalculo
        : config.ivaPct * subtotalGeneralCalculo;
    const totalConIva = subtotalGeneralCalculo + ivaCalculo;

    // Comisión comercial: sin verificar contra un caso real (siempre fue 0 en Tintalá).
    // Base asumida: total del proyecto con IVA.
    const gastoComision = config.pctComision * totalConIva;
    const totalGastos = gastoAdmin + gastoRenta + gastoIca + gastoComision;

    const nuevoFactor = 1 - totalGastos / totalConIva;
    if (Math.abs(nuevoFactor - factor) < 0.0000001) {
      factor = nuevoFactor;
      break;
    }
    factor = nuevoFactor;
  }
  return factor;
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
  factorRecargoProyecto: number;
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
  // Gastos internos y utilidad real del proyecto (capas de utilidad)
  gastoAdmin: number;
  gastoRenta: number;
  gastoIca: number;
  gastoComision: number;
  totalGastos: number;
  utilidadTotal: number;
  pctUtilidadTotal: number;
  impuestosATransferir: number;
}

export function calcularTotales(
  lineasCrudas: LineaCotizacion[],
  config: ConfigPrecio,
): TotalesCotizacion {
  const subtotalCompraLineas = round2(
    lineasCrudas.reduce((acc, l) => acc + l.valorCompraUnitario * l.cantidad, 0),
  );
  const subtotalVentaLineas = round2(
    lineasCrudas.reduce(
      (acc, l) =>
        acc +
        calcularVentaUnitario(l.valorCompraUnitario, l.factorRentabilidadLinea) *
          l.cantidad,
      0,
    ),
  );

  const factorRecargoProyecto = calcularFactorRecargo(
    subtotalCompraLineas,
    subtotalVentaLineas,
    config,
  );

  const lineas = lineasCrudas.map((l) =>
    calcularLinea(l, factorRecargoProyecto),
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

  // Gastos internos (bases reales verificadas contra Tintalá)
  const adminVenta = config.pctAdmin * subtotalVenta;
  const imprevistosVenta = config.pctImprevistos * subtotalVenta;
  const utilidadVenta = config.pctUtilidadAiu * subtotalVenta;
  const subtotalGeneralVenta =
    subtotalVenta + adminVenta + imprevistosVenta + utilidadVenta;

  const gastoAdmin = round2(config.pctAdminGasto * subtotalCompra);
  const rentaBase = esAiu ? utilidadVenta : subtotalGeneralVenta - subtotalVenta;
  const gastoRenta = round2(config.pctRenta * rentaBase);
  const gastoIca = round2((config.icaPorMil / 1000) * subtotalGeneralVenta);
  const gastoComision = round2(config.pctComision * total);
  const totalGastos = round2(gastoAdmin + gastoRenta + gastoIca + gastoComision);

  const utilidadTotal = round2(
    subtotalGeneralVenta - subtotalCompra + gastoAdmin,
  );
  const pctUtilidadTotal = total ? round2((utilidadTotal / total) * 100) : 0;
  const impuestosATransferir = round2(gastoRenta + gastoIca + valorIva);

  return {
    lineas,
    factorRecargoProyecto,
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
    gastoAdmin,
    gastoRenta,
    gastoIca,
    gastoComision,
    totalGastos,
    utilidadTotal,
    pctUtilidadTotal,
    impuestosATransferir,
  };
}

export function formatCOP(valor: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(valor);
}

// No hay regla por categoría: en la práctica Jhojan fija el factor línea a línea
// (0.85 es lo más frecuente, 0.88 para algunos ítems, 0.80 para otros de mano de
// obra). 0.85 como default en las tres categorías es la mejor aproximación hasta
// que aparezca una lógica — siempre editable por línea.
export const FACTORES_RENTABILIDAD_DEFAULT: Record<Categoria, number> = {
  EQUIPO: 0.85,
  MATERIAL: 0.85,
  MANO_DE_OBRA: 0.85,
};

export const UNIDADES_SUGERIDAS = ["UNI", "GL", "ML", "M2", "M3", "HR", "GLB"];
