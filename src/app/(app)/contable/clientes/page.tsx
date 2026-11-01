import { TercerosSiigo } from "@/components/siigo/Terceros";

/** Clientes según Siigo (migración 128). Solo lectura. */
export default async function ClientesSiigoPage(props: PageProps<"/contable/clientes">) {
  const sp = await props.searchParams;
  return <TercerosSiigo rol="cliente" q={typeof sp.q === "string" ? sp.q : ""} />;
}
