// Edge Function "enviar-push" (Supabase): manda al celular las notificaciones nuevas (Web Push).
// La dispara un cron cada minuto; vive al lado de los datos y no depende de ningún PC.
//
//   1. Lo viejo que nunca salió (más de 6 h) se marca sin enviarlo: un aviso tarde confunde más
//      de lo que ayuda (en la app sigue estando).
//   2. Toma lo pendiente (push_enviada_en vacío) y lo RECLAMA con un update condicionado: si dos
//      vueltas coinciden, cada notificación sale una sola vez.
//   3. La manda a los dispositivos activos de su destinatario con el MISMO título y cuerpo de la
//      notificación (ya redactados sin montos: esto sale en la pantalla de bloqueo).
//   4. Un dispositivo que responde 404/410 (el usuario revocó el permiso o desinstaló) queda
//      revocado y no se le vuelve a intentar.
//
// Secretos (supabase secrets set --env-file …): VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT.
// SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY los pone Supabase. Solo acepta llamadas con la clave de
// servicio (Authorization: Bearer …): con la clave pública no se dispara.

import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const VENTANA_MS = 6 * 3600 * 1000;
const LOTE = 200;

Deno.serve(async (req) => {
  const url = Deno.env.get("SUPABASE_URL");
  const servicio = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const publica = Deno.env.get("VAPID_PUBLIC_KEY");
  const privada = Deno.env.get("VAPID_PRIVATE_KEY");
  const sujeto = Deno.env.get("VAPID_SUBJECT");
  if (!url || !servicio || !publica || !privada || !sujeto) {
    return Response.json({ error: "Faltan secretos: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY o VAPID_SUBJECT." }, { status: 500 });
  }
  if ((req.headers.get("authorization") ?? "") !== `Bearer ${servicio}`) {
    return Response.json({ error: "Solo con la clave de servicio." }, { status: 401 });
  }
  webpush.setVapidDetails(sujeto, publica, privada);
  const db = createClient(url, servicio, { auth: { persistSession: false } });
  const ahora = new Date().toISOString();

  // 1) Lo viejo no se manda tarde.
  await db.from("notificaciones").update({ push_enviada_en: ahora }).is("push_enviada_en", null).lt("creada_en", new Date(Date.now() - VENTANA_MS).toISOString());

  // 2) Pendientes, reclamados por esta vuelta.
  const { data: pendientes, error: e1 } = await db.from("notificaciones").select("id").is("push_enviada_en", null).order("creada_en").limit(LOTE);
  if (e1) return Response.json({ error: e1.message }, { status: 500 });
  if (!pendientes?.length) return Response.json({ enviadas: 0 });
  const { data: mias, error: e2 } = await db
    .from("notificaciones")
    .update({ push_enviada_en: ahora })
    .in("id", pendientes.map((p) => p.id))
    .is("push_enviada_en", null)
    .select("id, destinatario_id, titulo, cuerpo, ruta, urgente, tipo");
  if (e2) return Response.json({ error: e2.message }, { status: 500 });

  // 3) Dispositivos activos de esos destinatarios.
  const destinatarios = [...new Set((mias ?? []).map((n) => n.destinatario_id))];
  const { data: subs, error: e3 } = await db
    .from("notificacion_suscripciones")
    .select("id, perfil_id, endpoint, p256dh, auth")
    .in("perfil_id", destinatarios)
    .is("revocada_en", null);
  if (e3) return Response.json({ error: e3.message }, { status: 500 });

  let enviados = 0;
  let revocados = 0;
  const errores: string[] = [];
  for (const n of mias ?? []) {
    const carga = JSON.stringify({ id: n.id, titulo: n.titulo, cuerpo: n.cuerpo, ruta: n.ruta, urgente: n.urgente, tipo: n.tipo });
    for (const s of (subs ?? []).filter((x) => x.perfil_id === n.destinatario_id)) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, carga, {
          TTL: 24 * 3600,
          urgency: n.urgente ? "high" : "normal",
        });
        enviados++;
      } catch (e) {
        const estado = (e as { statusCode?: number }).statusCode;
        if (estado === 404 || estado === 410) {
          await db.from("notificacion_suscripciones").update({ revocada_en: ahora }).eq("id", s.id);
          revocados++;
        } else {
          errores.push(`${estado ?? "?"}: ${(e as Error).message?.slice(0, 120)}`);
        }
      }
    }
  }
  return Response.json({ notificaciones: mias?.length ?? 0, enviados, revocados, errores: errores.slice(0, 10) });
});
