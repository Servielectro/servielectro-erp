import { TercerosSiigo } from "@/components/siigo/Terceros";

/** Proveedores según Siigo (migración 128). Solo lectura. */
export default async function ProveedoresSiigoPage(props: PageProps<"/contable/proveedores">) {
  const sp = await props.searchParams;
  return <TercerosSiigo rol="proveedor" q={typeof sp.q === "string" ? sp.q : ""} />;
}
