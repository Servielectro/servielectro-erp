// Edge Function "barrer-secop" (Supabase): el radar de licitaciones.
//
// Baja de Datos Abiertos (SECOP II, dataset p6dx-8zbt en datos.gov.co) los procesos ABIERTOS
// publicados en la ventana, y se los pasa a la base por lotes. La base decide (fn_licitaciones_ingerir):
// aplica los cinco criterios de relevancia como cálculo fijo, guarda sin duplicar por id_del_proceso
// y avisa las relevantes que no exigen RUP (trigger). Esta función solo transporta: no decide nada.
//
// Cada corrida queda en licitacion_barridos, con el error si falla. Una corrida sin terminado_en ni
// error = se cortó (timeout de la función).
//
// Ventana: los publicados en los últimos DIAS_VENTANA días. Datos Abiertos tarda 1 a 3 días en
// pasar un proceso; 5 días cubren la latencia con margen, y como la llave es id_del_proceso,
// volver a ver un proceso solo lo actualiza. Primera corrida o recuperación: body {"dias": 30}.
//
// Token de la app (Socrata): OPCIONAL. Si el cron lo manda en el body ({"app_token": …}, leído de
// Vault en cada vuelta), se usa; si no, se consulta anónimo (Socrata lo permite con un límite más
// bajo, de sobra para una corrida diaria). Nunca se escribe en el código.
//
// ─── SEGURIDAD: por qué se despliega con --no-verify-jwt (y por qué eso NO la abre) ───────────
//   supabase functions deploy barrer-secop --no-verify-jwt
// El control de acceso NO se quitó: se movió del gateway a esta función. Lo primero que hace el
// handler (abajo, antes de leer el body o tocar la base) es rechazar con 401 toda llamada cuyo
// header `x-push-token` no sea EXACTAMENTE el token 'push_token_cron' de Vault. Ese token solo lo
// lee la clave de servicio (fn_push_config: EXECUTE solo para service_role y postgres; ni anon ni
// authenticated). Es el mismo control que usa enviar-push EN PRODUCCIÓN, desplegada con
// --no-verify-jwt y llamada por fn_disparar_push con ese header.
// Por qué no en el gateway: el token de Vault no tiene formato JWT; el gateway lo rebota con 401
// «Invalid JWT» antes de llegar acá (pasó en el primer despliegue, 2026-11-07). Lo autorizó el
// responsable del proyecto ese día, tras verificar que la función rechaza sola.
// Historia (2026-11-07): la primera versión comparaba `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>`,
// copiada del enviar-push del REPO. Pero el enviar-push desplegado ya no es ese (cambió fuera del
// repo) y Vault no guarda la clave de servicio sino push_token_cron: el barrido rebotaba 401 en la
// función. Se alineó con lo que de verdad corre.
// Si alguien toca este archivo: NO quitar ni aflojar esa comprobación. Sin ella, con
// --no-verify-jwt, cualquiera con la URL dispararía barridos con la clave de servicio. Si algún día
// se quita, hay que volver a desplegar CON verificación de JWT.

import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const DATASET = "https://www.datos.gov.co/resource/p6dx-8zbt.json";
const DIAS_VENTANA = 5;
const PAGINA = 1000;
const MAX_PAGINAS = 60; // tope de seguridad: 60.000 filas por corrida

// Solo los campos que usa la base (la fila completa pesa el triple).
const CAMPOS = [
  "id_del_proceso", "referencia_del_proceso", "entidad", "nit_entidad", "departamento_entidad",
  "ciudad_entidad", "nombre_del_procedimiento", "descripci_n_del_procedimiento", "fase",
  "fecha_de_publicacion_del", "fecha_de_ultima_publicaci", "fecha_de_recepcion_de", "precio_base",
  "modalidad_de_contratacion", "tipo_de_contrato", "duracion", "unidad_de_duracion",
  "estado_del_procedimiento", "estado_de_apertura_del_proceso", "codigo_principal_de_categoria",
  "categorias_adicionales", "urlproceso",
  // 147: id_del_portafolio (CO1.BDOS…) es la llave de los documentos en dmgg-8hin; la apertura de
  // ofertas y si está adjudicado van a la ficha.
  "id_del_portafolio", "fecha_de_apertura_de_respuesta", "adjudicado",
].join(",");

/** Fecha local de Colombia, como la guarda Socrata (floating timestamp, sin zona). */
function fechaColombia(d: Date): string {
  return new Date(d.getTime() - 5 * 3600 * 1000).toISOString().slice(0, 19);
}

Deno.serve(async (req) => {
  const url = Deno.env.get("SUPABASE_URL");
  const servicio = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !servicio) return Response.json({ error: "Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY." }, { status: 500 });
  const db = createClient(url, servicio, { auth: { persistSession: false } });

  // EL CONTROL DE ACCESO (ver el encabezado). Antes de leer el body o escribir nada: el header
  // x-push-token tiene que ser el token de Vault, que solo lee la clave de servicio (fn_push_config).
  const { data: cfg, error: eCfg } = await db.rpc("fn_push_config").single();
  const esperado = (cfg as { token: string | null } | null)?.token ?? null;
  if (eCfg || !esperado) return Response.json({ error: "No se pudo leer el token de Vault." }, { status: 500 });
  if ((req.headers.get("x-push-token") ?? "") !== esperado) {
    return Response.json({ error: "No autorizado." }, { status: 401 });
  }

  let cuerpo: { dias?: number; app_token?: string | null } = {};
  try { cuerpo = await req.json(); } catch { /* sin body: valores por defecto */ }
  const dias = Number.isFinite(cuerpo.dias) && cuerpo.dias! > 0 && cuerpo.dias! <= 90 ? Math.floor(cuerpo.dias!) : DIAS_VENTANA;
  const token = typeof cuerpo.app_token === "string" && cuerpo.app_token.trim() ? cuerpo.app_token.trim() : null;
  const ahora = new Date();
  const desde = new Date(ahora.getTime() - dias * 86400 * 1000);

  const { data: barrido, error: eAbrir } = await db.rpc("fn_licitaciones_barrido_abrir", {
    p_ventana_desde: desde.toISOString(),
    p_con_token: token !== null,
  });
  if (eAbrir || !barrido) return Response.json({ error: `No se pudo abrir el barrido: ${eAbrir?.message}` }, { status: 500 });

  const totales = { leidos: 0, con_actividad: 0, relevantes: 0, nuevos: 0, sin_rup: 0, paginas: 0, recalculadas: 0 };
  try {
    // Abiertos para ofertar: publicados en la ventana, en estado Publicado/Abierto, y que no hayan
    // cerrado (o sin fecha de cierre: la base decide; no se esconde por falta del dato).
    const where = [
      `fecha_de_publicacion_del >= '${fechaColombia(desde)}'`,
      `estado_de_apertura_del_proceso = 'Abierto'`,
      `estado_del_procedimiento in ('Publicado', 'Abierto')`,
      `(fecha_de_recepcion_de is null or fecha_de_recepcion_de >= '${fechaColombia(ahora)}')`,
    ].join(" AND ");

    for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
      const q = new URLSearchParams({
        $select: CAMPOS,
        $where: where,
        $order: "id_del_proceso",
        $limit: String(PAGINA),
        $offset: String(pagina * PAGINA),
      });
      const r = await fetch(`${DATASET}?${q}`, { headers: token ? { "X-App-Token": token } : {} });
      if (!r.ok) throw new Error(`Datos Abiertos respondió ${r.status}: ${(await r.text()).slice(0, 300)}`);
      const filas = await r.json();
      if (!Array.isArray(filas)) throw new Error("Datos Abiertos no devolvió un arreglo.");
      if (filas.length === 0) break;
      totales.paginas++;

      const { data: lote, error: eLote } = await db.rpc("fn_licitaciones_ingerir", { p_barrido: barrido, p_filas: filas });
      if (eLote) throw new Error(`La base rechazó el lote ${pagina + 1}: ${eLote.message}`);
      for (const k of ["leidos", "con_actividad", "relevantes", "nuevos", "sin_rup"] as const) totales[k] += Number(lote?.[k] ?? 0);

      if (filas.length < PAGINA) break;
      if (pagina === MAX_PAGINAS - 1) throw new Error(`Se llegó al tope de ${MAX_PAGINAS} páginas: la ventana trae más de lo esperado.`);
    }

    // Lo que sigue abierto pero salió de la ventana: se recalcula con los criterios de hoy.
    const { data: n, error: eRec } = await db.rpc("fn_licitaciones_recalcular");
    if (eRec) throw new Error(`No se pudo recalcular: ${eRec.message}`);
    totales.recalculadas = Number(n ?? 0);

    const { error: eCerrar } = await db.rpc("fn_licitaciones_barrido_cerrar", { p_barrido: barrido, p_error: null });
    if (eCerrar) throw new Error(`No se pudo cerrar el barrido: ${eCerrar.message}`);
    return Response.json({ barrido, dias, con_token: token !== null, ...totales });
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : String(e);
    await db.rpc("fn_licitaciones_barrido_cerrar", { p_barrido: barrido, p_error: mensaje });
    return Response.json({ barrido, error: mensaje, ...totales }, { status: 500 });
  }
});
