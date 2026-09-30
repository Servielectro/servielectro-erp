import type { SupabaseClient } from "@supabase/supabase-js";

/** Lo que el buscador de clientes necesita para autocompletar la cotización. */
export interface ClienteResumen {
  id: string;
  nombre: string;
  nit: string | null;
  direccion: string | null;
  email: string | null;
  contacto: string | null;
  telefono: string | null;
}

export async function getClientesActivos(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
): Promise<ClienteResumen[]> {
  const { data, error } = await supabase
    .from("clientes")
    .select("id, nombre, nit, direccion, email, contacto, telefono")
    .eq("activo", true)
    .order("nombre");
  if (error) throw error;
  return (data ?? []) as ClienteResumen[];
}
