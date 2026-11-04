import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { docComparable } from "@/lib/sst/plantillas";

/**
 * "Tienes una capacitación pendiente de firmar", en el inicio y en SG-SST, para que el técnico no
 * dependa de un enlace. Sesiones FOR-02 en borrador con firmas pendientes:
 *   - si el perfil tiene cédula, solo las que la tienen en la lista y sin su firma;
 *   - si no (los técnicos no están enlazados a empleados ni tienen cédula en el sistema), a quien
 *     tiene "trabajar" se le muestran las abiertas con alguien por firmar; en la sesión escribe su
 *     cédula y se busca en la lista.
 * Sin acceso a la sección capacitaciones (fn_permiso_seccion NULL) no pinta nada.
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
  if (nivel !== "trabajar" && nivel !== "responsable") return null;
  // La responsable tiene su listado; sin cédula, el aviso genérico es solo para quien firma.
  if (!cedula && nivel !== "trabajar") return null;

  const { data: sesiones } = await supabase.from("v_sst_capacitaciones").select("id, fecha, tema").eq("estado", "borrador").order("fecha");
  const ids = ((sesiones ?? []) as { id: string }[]).map((s) => s.id);
  if (!ids.length) return null;
  const [listasRes, firmasRes] = await Promise.all([
    supabase.from("sst_formatos").select("id, tecnicos_en_obra").in("id", ids),
    supabase.from("sst_formato_firmas").select("formato_id, documento").in("formato_id", ids).eq("rol", "tecnico"),
  ]);
  const firmas = (firmasRes.data ?? []) as { formato_id: string; documento: string }[];
  const faltan = (f: { id: string; tecnicos_en_obra: { documento: string }[] | null }) =>
    (f.tecnicos_en_obra ?? [])
      .map((t) => docComparable(String(t.documento ?? "")))
      .filter((d) => !firmas.some((x) => x.formato_id === f.id && docComparable(x.documento) === d))
      .filter((d) => !cedula || d === cedula);
  const conPendientes = new Set(((listasRes.data ?? []) as { id: string; tecnicos_en_obra: { documento: string }[] | null }[]).filter((f) => faltan(f).length > 0).map((f) => f.id));
  const pendientes = ((sesiones ?? []) as { id: string; fecha: string; tema: string | null }[]).filter((s) => conPendientes.has(s.id));
  if (!pendientes.length) return null;

  return (
    <section className="space-y-2 rounded-lg border-2 border-amber-500 bg-amber-50 p-3">
      <p className="text-base font-bold text-amber-900">
        {cedula
          ? pendientes.length === 1
            ? "Tienes una capacitación pendiente de firmar"
            : `Tienes ${pendientes.length} capacitaciones pendientes de firmar`
          : pendientes.length === 1
            ? "Hay una capacitación abierta para firmar"
            : `Hay ${pendientes.length} capacitaciones abiertas para firmar`}
      </p>
      {pendientes.map((s) => (
        <Link key={s.id} href={`/sgsst/capacitaciones/${s.id}`} className="flex min-h-12 items-center justify-between gap-2 rounded-md border border-amber-400 bg-white px-3 py-2 active:bg-amber-100">
          <span>
            <span className="block font-semibold text-slate-900">{s.tema || "Capacitación"}</span>
            <span className="block text-sm text-slate-600">{s.fecha} · {cedula ? "lee el material y firma" : "si estás en la lista: entra, escribe tu cédula, lee y firma"}</span>
          </span>
          <span className="text-lg" aria-hidden>
            →
          </span>
        </Link>
      ))}
    </section>
  );
}
