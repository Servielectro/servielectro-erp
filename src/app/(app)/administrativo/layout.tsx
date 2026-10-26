import { requierePermiso } from "@/lib/permisos";

// Administrativo (decisión del 2026-10-25): los maestros —clientes, sedes y más adelante
// proveedores—, "quién es y cómo lo contacto". La plata (cartera, cuentas por pagar) va en
// Financiero: aquí nada muestra montos.
export default async function AdministrativoLayout({ children }: { children: React.ReactNode }) {
  await requierePermiso("administrativo", "consultar");
  return children;
}
