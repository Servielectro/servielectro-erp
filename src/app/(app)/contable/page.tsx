import { createClient } from "@/lib/supabase/server";
import { seccionesOcultas } from "@/lib/permisos";
import { PortadaSiigo, type Tarjeta } from "@/components/siigo/Portada";

const TARJETAS: Tarjeta[] = [
  { href: "/contable/clientes", icono: "🏢", nombre: "Clientes en Siigo", texto: "Solo lectura: los terceros que Siigo tiene como clientes, y si existen en el ERP. Se crean en Administrativo." },
  { href: "/contable/proveedores", icono: "🚚", nombre: "Proveedores", texto: "Los terceros que Siigo tiene como proveedores." },
  { href: "/contable/cuentas-tercero", icono: "📒", nombre: "Cuentas por tercero", texto: "Saldo de cada cuenta por cliente o proveedor." },
  { href: "/contable/balances", icono: "⚖️", nombre: "Balances", texto: "Balance de prueba por mes, incluido el cierre (13)." },
  { href: "/contable/iva", icono: "🧾", nombre: "IVA", texto: "Generado, descontable y lo que se debe por periodo." },
  { href: "/contable/conciliacion", icono: "🔀", nombre: "Conciliación con el ERP", texto: "Terceros que están en un lado y no en el otro." },
  { href: "/contable/conexion", icono: "🔌", nombre: "Conexión con Siigo", texto: "Estado de la conexión, cuentas de IVA e historial." },
  { href: "/contable/sugerencias", icono: "📝", nombre: "Sugerencias para la aplicación", texto: "Lo que mejorarías de Contable en la aplicación: escribe y guarda." },
];

/** Contable (migraciones 128 y 129): espejo de solo lectura de la contabilidad de Siigo. */
export default async function ContablePage() {
  const supabase = await createClient();
  const [cfg, sinc, secciones] = await Promise.all([
    supabase.from("siigo_config").select("activo").eq("id", 1).maybeSingle(),
    supabase.from("siigo_sincronizaciones").select("estado, terminada_en, iniciada_en").order("iniciada_en", { ascending: false }).limit(1),
    seccionesOcultas(),
  ]);
  const ocultas = new Set(secciones.ocultas);
  return (
    <PortadaSiigo
      titulo="Contable"
      texto="La contabilidad de Siigo, para consultar. La contadora trabaja en Siigo; aquí no se edita nada."
      conectado={!!cfg.data?.activo}
      ultima={(sinc.data?.[0] as { estado: string; terminada_en: string | null; iniciada_en: string } | undefined) ?? null}
      tarjetas={TARJETAS.filter((t) => !ocultas.has(t.href))}
    />
  );
}
