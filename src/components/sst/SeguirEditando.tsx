import Link from "next/link";

/**
 * "Seguir editando" arriba de un formato o acta (pedido de Jhojan, 2026-10-27: "hasta que no se
 * firme, debemos poder seguir editando… por si se pierde la señal, se cierra la app o pierdo el
 * proceso en el cel o tablet"). Quien la muestra decide con el REGISTRO, igual que la base: estado
 * borrador y ninguna firma (fn_sst_formato_tiene_firmas). Lleva al llenado de campo, que guarda en
 * el dispositivo a cada cambio y sube por la cola; desde cualquier celular o tablet se retoma.
 */
export function SeguirEditando({ href }: { href: string }) {
  return (
    <Link href={href} className="flex min-h-11 w-full items-center justify-center rounded-md bg-brand-red px-4 text-sm font-semibold text-white">
      Seguir editando
    </Link>
  );
}
