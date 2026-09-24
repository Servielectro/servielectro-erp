// Dígito de verificación del NIT — algoritmo oficial de la DIAN (módulo 11 con pesos primos).
// Fuente: documentado en múltiples firmas contables y sistemas de facturación electrónica
// certificados por la DIAN (ver docs/ERP-Servielectro-Modulo1-Proyectos.md §14).
//
// Sirve para detectar en el acto si la IA leyó mal un dígito del NIT al procesar un RUT:
// es una comprobación matemática, no depende de la IA, y es gratis.

const PESOS_DIAN = [
  3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71,
];

/**
 * Calcula el dígito de verificación de un NIT según el algoritmo de la DIAN.
 * @param nit NIT sin puntos, guiones ni dígito de verificación (solo dígitos).
 * @returns El dígito de verificación (0-9), o null si el NIT no es válido (vacío, no numérico, más de 15 dígitos).
 */
export function calcularDigitoVerificacion(nit: string): number | null {
  const limpio = nit.replace(/\D/g, "");
  if (!limpio || limpio.length > 15) return null;

  const digitos = limpio.split("").reverse().map(Number);
  const suma = digitos.reduce(
    (acc, digito, i) => acc + digito * PESOS_DIAN[i],
    0,
  );

  const residuo = suma % 11;
  if (residuo === 0 || residuo === 1) return residuo;
  return 11 - residuo;
}

export interface ValidacionNit {
  valido: boolean;
  dvCalculado: number | null;
  dvEsperado: number | null;
}

/**
 * Compara el DV que leyó la IA (o que digitó el usuario) contra el DV real calculado.
 * Si no coinciden, casi siempre significa que se leyó mal un dígito del NIT o del DV.
 */
export function validarNit(nit: string, dv: string | number): ValidacionNit {
  const dvCalculado = calcularDigitoVerificacion(nit);
  const dvEsperado = Number(String(dv).replace(/\D/g, ""));

  return {
    valido: dvCalculado !== null && dvCalculado === dvEsperado,
    dvCalculado,
    dvEsperado: Number.isNaN(dvEsperado) ? null : dvEsperado,
  };
}
