// NIT comparable: solo los dígitos antes del dígito de verificación.
// "900.123.456-7", "900123456-7" y "900123456" → "900123456".
// Misma regla que fn_nit_base en la base (migración 31).
export function nitBase(nit: string | null | undefined): string | null {
  const base = (nit ?? "").split("-")[0].replace(/\D/g, "");
  return base || null;
}
