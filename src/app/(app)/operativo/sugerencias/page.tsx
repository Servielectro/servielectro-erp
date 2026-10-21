import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { tienePermiso } from "@/lib/permisos";
import { cargarDatosTareas } from "@/lib/supabase/tareas";
import { BandejaSugerencias, type SugerenciaBandeja } from "./BandejaSugerencias";

// Bandeja de sugerencias de los técnicos (el layout exige operativo/consultar). El
// técnico sugiere en la visita; acá el supervisor las ve ordenadas por "para cuándo"
// (los materiales pedidos por fecha) y el comercial las toma, las cotiza o las descarta
// con motivo. Cada paso queda en sugerencia_eventos (fn_cambiar_estado_sugerencia).
export default async function SugerenciasPage() {
  const supabase = await createClient();
  const [comercial, operativo, veCotizaciones] = await Promise.all([
    tienePermiso("comercial", "trabajar"),
    tienePermiso("operativo", "trabajar"),
    tienePermiso("comercial", "consultar"),
  ]);

  const [sugRes, cotRes] = await Promise.all([
    supabase
      .from("visita_sugerencias")
      .select(
        "id, visita_id, descripcion, cantidad, unidad, motivo, requerido_para, sugerida_en, estado, motivo_descarte, cotizacion_id, visitas(titulo, cliente_nombre), sugerencia_eventos(estado_anterior, estado_nuevo, comentario, actor_nombre, creado_en)",
      )
      .order("requerido_para", { ascending: true, nullsFirst: false })
      .order("sugerida_en", { ascending: false })
      .limit(300),
    veCotizaciones
      ? supabase.from("cotizaciones").select("id, codigo, descripcion").order("created_at", { ascending: false }).limit(60)
      : Promise.resolve({ data: [], error: null }),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sugerencias: SugerenciaBandeja[] = (sugRes.data ?? []).map((s: any) => {
    const eventos = [...(s.sugerencia_eventos ?? [])].sort((a, b) => String(a.creado_en).localeCompare(String(b.creado_en)));
    const visita = Array.isArray(s.visitas) ? s.visitas[0] : s.visitas;
    return {
      id: s.id,
      descripcion: s.descripcion,
      cantidad: s.cantidad === null ? null : Number(s.cantidad),
      unidad: s.unidad,
      motivo: s.motivo,
      requeridoPara: s.requerido_para,
      sugeridaEn: s.sugerida_en,
      estado: s.estado,
      motivoDescarte: s.motivo_descarte,
      cotizacionId: s.cotizacion_id,
      visita: visita?.titulo ?? "",
      visitaId: s.visita_id,
      cliente: visita?.cliente_nombre ?? null,
      sugeridaPor: eventos[0]?.actor_nombre ?? null,
      eventos: eventos.map((e) => ({
        de: e.estado_anterior,
        a: e.estado_nuevo,
        comentario: e.comentario,
        quien: e.actor_nombre,
        cuando: e.creado_en,
      })),
    };
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const datosTareas = await cargarDatosTareas(supabase, user?.id ?? "", operativo);

  const codigoDe = new Map(((cotRes.data ?? []) as { id: string; codigo: string }[]).map((c) => [c.id, c.codigo]));

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 p-4 sm:p-6">
      <Link href="/operativo" className="inline-flex min-h-11 items-center text-sm text-slate-600">
        ← Operativo
      </Link>
      <h1 className="mb-1 mt-2 text-center text-sm font-bold text-slate-900">Sugerencias de los técnicos</h1>
      <p className="mb-4 text-center text-xs text-slate-600">
        Lo que el técnico vio que falta, ordenado por para cuándo lo necesita. Cotizar o descartar queda en el historial.
      </p>
      {sugRes.error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">No se pudieron leer las sugerencias: {sugRes.error.message}</p>
      ) : (
        <BandejaSugerencias
          sugerenciasIniciales={sugerencias}
          puedeComercial={comercial}
          puedeOperativo={operativo}
          cotizaciones={((cotRes.data ?? []) as { id: string; codigo: string; descripcion: string | null }[]).map((c) => ({
            id: c.id,
            etiqueta: c.descripcion ? `${c.codigo} · ${c.descripcion}` : c.codigo,
          }))}
          codigos={Object.fromEntries(codigoDe)}
          yo={user?.id ?? ""}
          tareasIniciales={datosTareas.tareas}
          obras={datosTareas.obras}
          personas={datosTareas.personas}
        />
      )}
    </div>
  );
}
