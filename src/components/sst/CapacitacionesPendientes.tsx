import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { docComparable } from "@/lib/sst/plantillas";

/**
 * "Tienes una capacitación pendiente de firmar": las sesiones FOR-02 en borrador cuya lista de
 * asistentes tiene la cédula del usuario (perfiles.cedula) y que todavía no tienen su firma. Sale en
 * el inicio y en SG-SST, para que el técnico no dependa de un enlace. Sin cédula en el perfil, sin
 * acceso a capacitaciones o sin nada pendiente: no pinta nada (no estorba a nadie más).
 */
export async function CapacitacionesPendientes() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const [perfilRes, nivelRes] = await Promise.all([
    supabase.from("perfiles").select("cedula").eq("id", user.id).maybeSingle(),
    supabase.rpc("fn_permiso_seccion", { p_modulo: "sgsst", p_seccion: "capacitaciones" }),
  ]);
  const cedula = docComparable(String((perfilRes.data as { cedula: string | null } | null)?.cedula ?? ""));
  // fn_permiso_seccion devuelve el nivel (enum) o NULL: firmar pide "trabajar" o más.
  const nivel = nivelRes.data as string | null;
  if (!cedula || (nivel !== "trabajar" && nivel !== "responsable")) return null;

  const { data: sesiones } = await supabase.from("v_sst_capacitaciones").select("id, fecha, tema").eq("estado", "borrador").order("fecha");
  const ids = ((sesiones ?? []) as { id: string }[]).map((s) => s.id);
  if (!ids.length) return null;
  const [listasRes, firmasRes] = await Promise.all([
    supabase.from("sst_formatos").select("id, tecnicos_en_obra").in("id", ids),
    supabase.from("sst_formato_firmas").select("formato_id, documento").in("formato_id", ids).eq("rol", "tecnico"),
  ]);
  const enLista = new Set(
    ((listasRes.data ?? []) as { id: string; tecnicos_en_obra: { documento: string }[] | null }[])
      .filter((f) => (f.tecnicos_en_obra ?? []).some((t) => docComparable(String(t.documento ?? "")) === cedula))
      .map((f) => f.id),
  );
  const firmadas = new Set(((firmasRes.data ?? []) as { formato_id: string; documento: string }[]).filter((x) => docComparable(x.documento) === cedula).map((x) => x.formato_id));
  const pendientes = ((sesiones ?? []) as { id: string; fecha: string; tema: string | null }[]).filter((s) => enLista.has(s.id) && !firmadas.has(s.id));
  if (!pendientes.length) return null;

  return (
    <section className="space-y-2 rounded-lg border-2 border-amber-500 bg-amber-50 p-3">
      <p className="text-base font-bold text-amber-900">
        {pendientes.length === 1 ? "Tienes una capacitación pendiente de firmar" : `Tienes ${pendientes.length} capacitaciones pendientes de firmar`}
      </p>
      {pendientes.map((s) => (
        <Link key={s.id} href={`/sgsst/capacitaciones/${s.id}`} className="flex min-h-12 items-center justify-between gap-2 rounded-md border border-amber-400 bg-white px-3 py-2 active:bg-amber-100">
          <span>
            <span className="block font-semibold text-slate-900">{s.tema || "Capacitación"}</span>
            <span className="block text-sm text-slate-600">{s.fecha} · lee el material y firma</span>
          </span>
          <span className="text-lg" aria-hidden>
            →
          </span>
        </Link>
      ))}
    </section>
  );
}
