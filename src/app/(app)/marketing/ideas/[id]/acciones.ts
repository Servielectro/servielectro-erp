"use server";

import { createClient } from "@/lib/supabase/server";
import { tienePermiso } from "@/lib/permisos";
import { generarConIA, type RespuestaIA } from "@/lib/ia/ia";
import { estadoPublicable, type Autorizacion } from "@/lib/marketing";
import {
  ESQUEMA_PROMPTS,
  INSTRUCCIONES_PROMPTS,
  LINEAS_NEGOCIO,
  conRestricciones,
  construirVetados,
  formatoImagen,
  laminasAGenerar,
  revisarEntrada,
  revisarSalida,
  textoDelPedido,
} from "@/lib/marketing-prompt";

export type ResultadoPrompts = { ok: true; cuantas: number } | { ok: false; error: string };

const POR_PROVEEDOR_MS = 45_000;
const ESTADOS_EDITABLES = ["idea", "guion", "arte"];

interface PromptIA {
  lamina: number;
  es: string;
  en: string;
}

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** PostgREST corta en max_rows aunque se pida más: se pagina hasta que no quede nada. */
async function todosLosNombres(supabase: Supabase, tabla: "clientes" | "cliente_sedes"): Promise<{ nombres: string[]; error?: string }> {
  const nombres: string[] = [];
  for (let desde = 0; ; ) {
    const { data, error } = await supabase.from(tabla).select("nombre").order("id").range(desde, desde + 999);
    if (error) return { nombres, error: error.message };
    if (!data?.length) return { nombres };
    nombres.push(...data.map((x) => x.nombre as string));
    desde += data.length;
  }
}

/** Escribe un prompt por lámina en marketing_piezas: `prompt` en inglés (el que se pega) y `texto` en español. */
export async function generarPromptsImagen(ideaId: string, lineaKey: string): Promise<ResultadoPrompts> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sesión no válida: vuelve a entrar." };
  if (!(await tienePermiso("marketing", "trabajar"))) return { ok: false, error: "No tienes permiso para trabajar en Marketing." };

  const linea = LINEAS_NEGOCIO.find((l) => l.key === lineaKey);
  if (!linea) return { ok: false, error: "Elige una línea de negocio vigente." };

  const [ideaRes, piezasRes] = await Promise.all([
    supabase
      .from("marketing_ideas")
      .select("id, tipo, canales, estado, gancho, guion, llamado_accion, proyectos(nombre), visitas(titulo, cliente_nombre, direccion)")
      .eq("id", ideaId)
      .maybeSingle(),
    supabase.from("marketing_piezas").select("id, orden, prompt, path, biblioteca_id, marketing_biblioteca(titulo, identificable, autorizacion)").eq("idea_id", ideaId),
  ]);
  if (ideaRes.error) return { ok: false, error: ideaRes.error.message };
  if (piezasRes.error) return { ok: false, error: `No se pudo revisar el material de la idea: ${piezasRes.error.message}` };
  if (!ideaRes.data) return { ok: false, error: "No encuentro esa idea." };
  const idea = ideaRes.data as unknown as {
    tipo: string;
    canales: string[];
    estado: string;
    gancho: string | null;
    guion: unknown;
    llamado_accion: string | null;
    proyectos: { nombre: string | null } | null;
    visitas: { titulo: string | null; cliente_nombre: string | null; direccion: string | null } | null;
  };
  if (!ESTADOS_EDITABLES.includes(idea.estado)) return { ok: false, error: "Esta idea ya pasó de «arte»: devuélvela a arte para cambiarle los prompts." };

  // El bloqueo de verdad: la pantalla lo muestra, pero la acción también se puede llamar directo.
  const piezas = (piezasRes.data ?? []) as unknown as {
    prompt: string | null;
    orden: number;
    path: string | null;
    biblioteca_id: string | null;
    marketing_biblioteca: { titulo: string; identificable: boolean; autorizacion: Autorizacion } | null;
  }[];
  const bloqueadas = piezas.filter((p) => p.biblioteca_id && (!p.marketing_biblioteca || !estadoPublicable(p.marketing_biblioteca.identificable, p.marketing_biblioteca.autorizacion).publicable));
  if (bloqueadas.length) {
    return { ok: false, error: `Bloqueado: esta idea usa material en el que se reconoce al cliente y no hay autorización registrada (${bloqueadas.map((p) => p.marketing_biblioteca?.titulo ?? "material sin leer").join(", ")}). Quítalo o registra la autorización en la biblioteca.` };
  }
  const conImagen = piezas.filter((p) => p.prompt && (p.path || p.biblioteca_id));
  if (conImagen.length) return { ok: false, error: `Ya hay ${conImagen.length} imagen(es) subida(s) sobre estos prompts. Quítalas primero para volver a generar.` };

  const gancho = idea.gancho?.trim() ?? "";
  const llamado = idea.llamado_accion?.trim() ?? "";
  const guion = Array.isArray(idea.guion) ? idea.guion : [];
  const laminasGuion = guion
    .map((x) => (typeof x === "string" ? x : typeof x === "object" && x && "texto" in x ? String((x as { texto: unknown }).texto ?? "") : ""))
    .map((t) => t.trim())
    .filter(Boolean);
  if (!gancho && !laminasGuion.length) return { ok: false, error: "Escribe el gancho o el guion y guarda: sin eso el prompt saldría genérico." };

  const [clientes, sedes] = await Promise.all([todosLosNombres(supabase, "clientes"), todosLosNombres(supabase, "cliente_sedes")]);
  // Sin la lista de clientes la revisión no sirve: no se sigue con el control apagado.
  if (clientes.error || !clientes.nombres.length) {
    return { ok: false, error: `No pude leer la lista de clientes para revisar que el texto no nombre a ninguno${clientes.error ? ` (${clientes.error})` : ""}. Sin esa revisión no se genera; tu usuario necesita ver Clientes.` };
  }
  const vetados = construirVetados([...clientes.nombres, ...sedes.nombres, idea.proyectos?.nombre, idea.visitas?.titulo, idea.visitas?.cliente_nombre, idea.visitas?.direccion]);

  const problemaEntrada = revisarEntrada({ gancho, laminas: laminasGuion, llamado }, vetados);
  if (problemaEntrada) return { ok: false, error: `Bloqueado: ${problemaEntrada}` };

  // El título no se manda: las oportunidades lo arman con el nombre de la obra o del cliente.
  const laminas = laminasAGenerar(idea.tipo, gancho, laminasGuion);
  const pedido = textoDelPedido({ linea, tipo: idea.tipo, gancho, llamado, laminas });

  let resultado: PromptIA[] = [];
  let r: RespuestaIA | null = null;
  let correccion = "";
  // Un reintento, diciéndole qué falló. Si insiste, no se guarda nada.
  for (let intento = 0; intento < 2; intento++) {
    try {
      r = await generarConIA(
        {
          para: "redactar el prompt",
          instrucciones: INSTRUCCIONES_PROMPTS,
          partes: [{ texto: pedido + correccion }],
          esquemaJson: ESQUEMA_PROMPTS,
          nombreEsquema: "prompts_imagen",
          temperatura: 0.6,
        },
        POR_PROVEEDOR_MS,
      );
      resultado = ((JSON.parse(r.texto) as { piezas?: PromptIA[] }).piezas ?? []).filter((p) => p.es?.trim() && p.en?.trim());
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "La IA no devolvió prompts válidos." };
    }
    if (resultado.length !== laminas.length) {
      correccion = `\n\nYour previous answer had ${resultado.length} item(s). Return exactly ${laminas.length}.`;
      resultado = [];
      continue;
    }
    const problema = resultado.map((p) => revisarSalida(p.es, vetados) ?? revisarSalida(p.en, vetados)).find(Boolean);
    if (!problema) {
      correccion = "";
      break;
    }
    correccion = `\n\nYour previous answer was rejected because it ${problema}. Rewrite it without that.`;
    resultado = [];
  }
  if (!resultado.length || !r) return { ok: false, error: "La IA insistió en proponer algo prohibido o incompleto, así que no se guardó nada. Intenta de nuevo o ajusta el guion." };

  // Solo se reemplazan los prompts que aún no tienen imagen; las fotos de la biblioteca no se tocan.
  const { error: e1 } = await supabase.from("marketing_piezas").delete().eq("idea_id", ideaId).not("prompt", "is", null).is("path", null).is("biblioteca_id", null);
  if (e1) return { ok: false, error: `No se pudieron reemplazar los prompts anteriores: ${e1.message}` };

  const quedan = piezas.filter((p) => !p.prompt).reduce((m, p) => Math.max(m, p.orden), 0);
  const formato = formatoImagen(idea.tipo, idea.canales ?? []);
  const modelo = r.modelo;
  const { error: e2 } = await supabase.from("marketing_piezas").insert(
    resultado.map((p, i) => ({
      idea_id: ideaId,
      orden: quedan + i + 1,
      tipo: "imagen",
      texto: conRestricciones(p.es, "es", formato),
      prompt: conRestricciones(p.en, "en", formato),
      modelo,
      generada_por: "nano_banana",
    })),
  );
  if (e2) return { ok: false, error: `Se redactaron pero no se pudieron guardar: ${e2.message}` };
  return { ok: true, cuantas: resultado.length };
}
