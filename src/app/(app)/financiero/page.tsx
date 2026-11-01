import { createClient } from "@/lib/supabase/server";
import { seccionesOcultas } from "@/lib/permisos";
import { PortadaSiigo, type Tarjeta } from "@/components/siigo/Portada";

const TARJETAS: Tarjeta[] = [
  { href: "/financiero/ventas", icono: "📈", nombre: "Ventas", texto: "Cuánto se vendió por día, mes, bimestre, cuatrimestre o año; a quién y qué." },
  { href: "/financiero/facturacion", icono: "🧾", nombre: "Facturación", texto: "Las facturas de venta, compra y notas crédito de Siigo." },
  { href: "/financiero/cuentas-pagar", icono: "📤", nombre: "Cuentas por pagar", texto: "Lo que se le debe a proveedores y cuándo vence." },
  { href: "/financiero/rentabilidad", icono: "🏗️", nombre: "Rentabilidad por proyecto", texto: "Lo facturado en Siigo contra lo que costó en el ERP." },
];

/** Financiero (migraciones 128 y 129): ventas, facturas y cartera leídas de Siigo, más la rentabilidad por obra. */
export default async function FinancieroPage() {
  const supabase = await createClient();
  const [cfg, sinc, secciones] = await Promise.all([
    supabase.from("siigo_config").select("activo").eq("id", 1).maybeSingle(),
    supabase.from("siigo_sincronizaciones").select("estado, terminada_en, iniciada_en").order("iniciada_en", { ascending: false }).limit(1),
    seccionesOcultas(),
  ]);
  const ocultas = new Set(secciones.ocultas);
  return (
    <PortadaSiigo
      titulo="Financiero"
      texto="Lo que se vendió, lo que se debe y si cada obra dejó plata. Se factura en Siigo; aquí se mira."
      conectado={!!cfg.data?.activo}
      ultima={(sinc.data?.[0] as { estado: string; terminada_en: string | null; iniciada_en: string } | undefined) ?? null}
      tarjetas={TARJETAS.filter((t) => !ocultas.has(t.href))}
    />
  );
}
