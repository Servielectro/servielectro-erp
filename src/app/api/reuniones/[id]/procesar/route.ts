import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { tienePermiso } from "@/lib/permisos";
import { MODELO_GEMINI } from "@/lib/ia/gemini";
import { ErrorReunion, redactar, transcribir } from "@/lib/reuniones/gemini-audio";
import { contextoReunion, normalizarActa, type Asistente } from "@/lib/reuniones/acta";

// Procesa una reunión (migración 86) en las dos etapas de la app de Jhojan, UNA por llamada:
//   ?etapa=transcribir → baja el audio de Storage (con la sesión del usuario) y lo transcribe.
//   ?etapa=redactar    → redacta el acta sobre la transcripción guardada (no gasta el audio).
// Cada etapa guarda su resultado: si algo falla, se reintenta desde donde quedó. El audio llega
// aquí desde Storage, nunca desde el navegador (el límite de 1 MB del cuerpo de la petición).
export const maxDuration = 300;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const etapa = new URL(request.url).searchParams.get("etapa");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Tu sesión venció: entra de nuevo." }, { status: 401 });
  if (!(await tienePermiso("proyectos", "trabajar"))) {
    return NextResponse.json({ ok: false, error: "Procesar reuniones requiere Proyectos en nivel “trabajar”." }, { status: 403 });
  }
  const { data: r } = await supabase
    .from("reuniones")
    .select("id, titulo, lugar, fecha, asistentes, aviso_grabacion, audio_path, audio_mime, transcripcion, estado, proyectos(clientes(nombre))")
    .eq("id", id)
    .maybeSingle();
  if (!r) return NextResponse.json({ ok: false, error: "No se encontró la reunión." }, { status: 404 });
  if (r.estado === "aprobada" || r.estado === "anulada") {
    return NextResponse.json({ ok: false, error: "El acta ya está aprobada o la reunión anulada: no se vuelve a procesar." }, { status: 409 });
  }
  if (!r.aviso_grabacion) return NextResponse.json({ ok: false, error: "Falta registrar el aviso de grabación." }, { status: 409 });

  const marcar = (cambios: Record<string, unknown>) => supabase.from("reuniones").update(cambios).eq("id", id);

  try {
    if (etapa === "transcribir") {
      if (!r.audio_path) throw new ErrorReunion("La reunión no tiene audio todavía.");
      await marcar({ estado: "transcribiendo", error: null });
      const { data: archivo, error } = await supabase.storage.from("reuniones").download(r.audio_path);
      if (error || !archivo) throw new ErrorReunion(`No se pudo leer el audio: ${error?.message ?? "sin archivo"}`);
      const texto = await transcribir(new Uint8Array(await archivo.arrayBuffer()), r.audio_mime);
      const { error: e } = await marcar({ transcripcion: texto, estado: "redactando", modelo: MODELO_GEMINI });
      if (e) throw new ErrorReunion(`La transcripción salió pero no se pudo guardar: ${e.message}`);
      return NextResponse.json({ ok: true, estado: "redactando" });
    }
    if (etapa === "redactar") {
      if (!r.transcripcion) throw new ErrorReunion("Todavía no hay transcripción.");
      await marcar({ estado: "redactando", error: null });
      const proyecto = r.proyectos as unknown as { clientes: { nombre: string } | null } | null;
      const contexto = contextoReunion(
        { titulo: r.titulo, lugar: r.lugar, fecha: r.fecha, asistentes: (r.asistentes ?? []) as Asistente[] },
        proyecto?.clientes?.nombre ?? null,
      );
      const crudo = await redactar(r.transcripcion, contexto);
      // `acta` guarda lo que devolvió la etapa 2 completo; `acta_revisada` arranca igual y es la que se corrige.
      const { error: e } = await marcar({ acta: crudo, acta_revisada: normalizarActa(crudo), estado: "lista", modelo: MODELO_GEMINI });
      if (e) throw new ErrorReunion(`El acta salió pero no se pudo guardar: ${e.message}`);
      return NextResponse.json({ ok: true, estado: "lista" });
    }
    return NextResponse.json({ ok: false, error: "Etapa desconocida." }, { status: 400 });
  } catch (err) {
    const mensaje = err instanceof ErrorReunion ? err.message : "Falló el procesamiento de la reunión. Inténtalo de nuevo.";
    await marcar({ estado: "error", error: mensaje.slice(0, 1000) });
    return NextResponse.json({ ok: false, error: mensaje }, { status: 500 });
  }
}
