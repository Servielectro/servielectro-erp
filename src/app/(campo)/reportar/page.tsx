import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Reportar } from "./Reportar";

// Reportar un acto o condición insegura (migración 77). Cualquiera con sesión, sin el módulo
// SG-SST. Se guarda en el celular (public/sw.js): funciona sin señal y sube después.
export default async function ReportarPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/reportar");
  return <Reportar />;
}
