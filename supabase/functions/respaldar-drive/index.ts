// Edge Function "respaldar-drive" (Supabase): copia los archivos de Storage al Google Drive de
// Jhojan y anota en la base cada copia verificada. La dispara un cron; no depende de ningún PC.
// Puesta en marcha y qué NO cubre (la base de datos): docs/respaldo-drive.md.
//
// Cada vuelta:
//   1. Toma el turno (fn_respaldo_tomar_turno): si otra vuelta sigue viva, no hace nada.
//   2. Pide un access token con el refresh token de Jhojan (OAuth, scope drive.file). Si Google
//      dice invalid_grant (vencido o revocado), cierra la vuelta como "autorizacion_vencida" y la
//      base le avisa al responsable de Configuración.
//   3. Reverifica copias viejas (files.get: que sigan ahí, sin papelera y con el mismo MD5). Una
//      que no está queda "perdida" y vuelve a la cola.
//   4. Sube lo pendiente (fn_respaldo_pendientes), en orden, hasta agotar el tiempo o el tope de
//      bytes de la vuelta. Antes de subir busca si ya está en Drive (appProperties con la clave
//      del archivo y su MD5): si una vuelta anterior subió y se murió antes de anotar, no duplica.
//   5. "Verificado" = el MD5 y el tamaño que Drive informa coinciden con los bytes bajados de
//      Storage. Solo entonces queda "respaldado" con su fecha. Si es audio de una reunión, se
//      anota también en la reunión (columnas de la migración 89).
//
// Reanudable: todo el estado vive en respaldo_drive_archivos; cada vuelta sigue donde quedó.
//
// Secretos (supabase secrets set --env-file C:\Proyectos\.secretos\drive.env): DRIVE_CLIENT_ID,
// DRIVE_CLIENT_SECRET, DRIVE_REFRESH_TOKEN, DRIVE_FOLDER_ID. SUPABASE_URL y
// SUPABASE_SERVICE_ROLE_KEY los pone Supabase. Solo acepta llamadas con la clave de servicio.

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.45.4";
import { crypto as stdCrypto } from "jsr:@std/crypto@1.0.3";
import { encodeHex } from "jsr:@std/encoding@1.0.5/hex";

const TIEMPO_MS = 110_000;              // el límite de una Edge Function es ~150 s
const TOPE_BYTES = 200 * 1024 * 1024;   // por vuelta (memoria y CPU acotadas)
const LOTE = 100;
const REVERIFICAR_CADA_DIAS = 7;
const REVERIFICAR_LOTE = 50;
const DRIVE = "https://www.googleapis.com/drive/v3";
const SUBIDA = "https://www.googleapis.com/upload/drive/v3/files";
const CARPETA = "application/vnd.google-apps.folder";

class AutorizacionVencida extends Error {}

async function md5(bytes: Uint8Array): Promise<string> {
  return encodeHex(await stdCrypto.subtle.digest("MD5", bytes));
}
async function sha256(texto: string): Promise<string> {
  return encodeHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto)));
}

async function accessToken(): Promise<string> {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: Deno.env.get("DRIVE_CLIENT_ID")!,
      client_secret: Deno.env.get("DRIVE_CLIENT_SECRET")!,
      refresh_token: Deno.env.get("DRIVE_REFRESH_TOKEN")!,
      grant_type: "refresh_token",
    }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    if (j.error === "invalid_grant") throw new AutorizacionVencida("Google rechazó el refresh token (invalid_grant): vencido o revocado.");
    throw new Error(`Token de Google: ${r.status} ${j.error ?? ""} ${j.error_description ?? ""}`);
  }
  return j.access_token as string;
}

function drive(token: string) {
  async function llamar(url: string, init: RequestInit = {}) {
    const r = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) } });
    if (r.status === 401) throw new AutorizacionVencida("Drive respondió 401: la autorización ya no sirve.");
    return r;
  }
  return {
    async buscarCopia(clave: string, md5Hex: string): Promise<{ id: string; md5Checksum: string; size: string } | null> {
      const q = `appProperties has { key='erp_k' and value='${clave}' } and appProperties has { key='erp_md5' and value='${md5Hex}' } and trashed = false`;
      const r = await llamar(`${DRIVE}/files?q=${encodeURIComponent(q)}&fields=files(id,md5Checksum,size)&pageSize=1`);
      if (!r.ok) throw new Error(`Buscar en Drive: ${r.status} ${await r.text()}`);
      return (await r.json()).files?.[0] ?? null;
    },
    async crearCarpeta(nombre: string, padre: string): Promise<string> {
      const r = await llamar(`${DRIVE}/files?fields=id`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nombre, mimeType: CARPETA, parents: [padre] }),
      });
      if (!r.ok) throw new Error(`Crear carpeta ${nombre}: ${r.status} ${await r.text()}`);
      return (await r.json()).id;
    },
    async subir(bytes: Uint8Array, mime: string, nombre: string, padre: string, propiedades: Record<string, string>, descripcion: string) {
      const inicio = await llamar(`${SUBIDA}?uploadType=resumable&fields=id,md5Checksum,size`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=UTF-8",
          "X-Upload-Content-Type": mime,
          "X-Upload-Content-Length": String(bytes.byteLength),
        },
        body: JSON.stringify({ name: nombre, parents: [padre], appProperties: propiedades, description: descripcion }),
      });
      if (!inicio.ok) throw new Error(`Iniciar subida: ${inicio.status} ${await inicio.text()}`);
      const sesion = inicio.headers.get("location");
      if (!sesion) throw new Error("Drive no devolvió la sesión de subida.");
      const r = await fetch(sesion, { method: "PUT", headers: { "Content-Type": mime }, body: bytes });
      if (!r.ok) throw new Error(`Subir: ${r.status} ${await r.text()}`);
      return (await r.json()) as { id: string; md5Checksum: string; size: string };
    },
    async estado(id: string): Promise<{ md5Checksum?: string; size?: string; trashed?: boolean } | null> {
      const r = await llamar(`${DRIVE}/files/${id}?fields=id,md5Checksum,size,trashed`);
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`Consultar ${id}: ${r.status} ${await r.text()}`);
      return await r.json();
    },
  };
}

// Carpeta de Drive para "bucket/sub/carpeta", creándola (y anotándola) si falta.
async function carpetaDe(db: SupabaseClient, d: ReturnType<typeof drive>, cache: Map<string, string>, raiz: string, ruta: string) {
  let padre = raiz;
  let acumulada = "";
  for (const parte of ruta.split("/").filter(Boolean)) {
    acumulada = acumulada ? `${acumulada}/${parte}` : parte;
    let id = cache.get(acumulada);
    if (!id) {
      id = await d.crearCarpeta(parte, padre);
      const { error } = await db.from("respaldo_drive_carpetas").insert({ ruta: acumulada, drive_id: id });
      if (error) throw new Error(`Anotar carpeta ${acumulada}: ${error.message}`);
      cache.set(acumulada, id);
    }
    padre = id;
  }
  return padre;
}

// Si el archivo es el audio de una reunión, la prueba de la copia va también en la reunión (89).
async function anotarEnReunion(db: SupabaseClient, bucket: string, ruta: string, copia: { id: string; md5: string } | null) {
  if (bucket !== "reuniones") return;
  const valores = copia
    ? { audio_drive_archivo_id: copia.id, audio_drive_md5: copia.md5, audio_drive_verificado_en: new Date().toISOString() }
    : { audio_drive_archivo_id: null, audio_drive_md5: null, audio_drive_verificado_en: null };
  const { error } = await db.from("reuniones").update(valores).eq("audio_path", ruta);
  if (error) throw new Error(`Anotar la copia en la reunión: ${error.message}`);
}

Deno.serve(async (req) => {
  const url = Deno.env.get("SUPABASE_URL");
  const servicio = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const raiz = Deno.env.get("DRIVE_FOLDER_ID");
  if (!url || !servicio || !raiz || !Deno.env.get("DRIVE_CLIENT_ID") || !Deno.env.get("DRIVE_CLIENT_SECRET") || !Deno.env.get("DRIVE_REFRESH_TOKEN")) {
    return Response.json({ error: "Faltan secretos: DRIVE_CLIENT_ID, DRIVE_CLIENT_SECRET, DRIVE_REFRESH_TOKEN o DRIVE_FOLDER_ID." }, { status: 500 });
  }
  if ((req.headers.get("authorization") ?? "") !== `Bearer ${servicio}`) {
    return Response.json({ error: "Solo con la clave de servicio." }, { status: 401 });
  }
  const db = createClient(url, servicio, { auth: { persistSession: false } });
  const inicio = Date.now();
  const quedaTiempo = () => Date.now() - inicio < TIEMPO_MS;

  const { data: corrida, error: eTurno } = await db.rpc("fn_respaldo_tomar_turno");
  if (eTurno) return Response.json({ error: eTurno.message }, { status: 500 });
  if (!corrida) return Response.json({ ocupado: "Hay otra vuelta trabajando." });

  const cuenta = { subidos: 0, reverificados: 0, perdidos: 0, errores: 0 };
  const errores: string[] = [];
  const latir = () => db.from("respaldo_drive_corridas").update({ latido_en: new Date().toISOString(), ...cuenta }).eq("id", corrida);
  const cerrar = async (resultado: string, detalle: string | null) => {
    const { data: pend } = await db.rpc("fn_respaldo_pendientes", { p_limite: 500 });
    await db.from("respaldo_drive_corridas").update({
      terminada_en: new Date().toISOString(), resultado, detalle, ...cuenta, pendientes_al_cerrar: pend?.length ?? null,
    }).eq("id", corrida);
    return Response.json({ resultado, ...cuenta, pendientes: pend?.length ?? null, errores: errores.slice(0, 10) });
  };

  try {
    const d = drive(await accessToken());

    // 3) Reverificar copias viejas.
    const limite = new Date(Date.now() - REVERIFICAR_CADA_DIAS * 86_400_000).toISOString();
    const { data: viejas } = await db.from("respaldo_drive_archivos").select("id, bucket, ruta, drive_file_id, drive_md5")
      .eq("estado", "respaldado").lt("verificado_en", limite).order("verificado_en").limit(REVERIFICAR_LOTE);
    for (const v of viejas ?? []) {
      if (!quedaTiempo()) break;
      const e = await d.estado(v.drive_file_id);
      if (e && !e.trashed && e.md5Checksum === v.drive_md5) {
        await db.from("respaldo_drive_archivos").update({ verificado_en: new Date().toISOString(), actualizado_en: new Date().toISOString() }).eq("id", v.id);
        await anotarEnReunion(db, v.bucket, v.ruta, { id: v.drive_file_id, md5: v.drive_md5 });
        cuenta.reverificados++;
      } else {
        await db.from("respaldo_drive_archivos").update({
          estado: "perdido", verificado_en: null, actualizado_en: new Date().toISOString(),
          ultimo_error: e ? (e.trashed ? "La copia está en la papelera de Drive." : "El MD5 de la copia ya no coincide.") : "La copia ya no existe en Drive.",
        }).eq("id", v.id);
        await anotarEnReunion(db, v.bucket, v.ruta, null).catch((x) => errores.push(String(x)));
        cuenta.perdidos++;
      }
    }

    // 4) Subir lo pendiente.
    const { data: carpetas } = await db.from("respaldo_drive_carpetas").select("ruta, drive_id");
    const cache = new Map((carpetas ?? []).map((c) => [c.ruta as string, c.drive_id as string]));
    let bytesVuelta = 0;
    const { data: pendientes, error: ePend } = await db.rpc("fn_respaldo_pendientes", { p_limite: LOTE });
    if (ePend) throw new Error(ePend.message);

    for (const p of pendientes ?? []) {
      if (!quedaTiempo() || bytesVuelta >= TOPE_BYTES) break;
      const { data: previa } = await db.from("respaldo_drive_archivos").select("id, intentos, drive_file_id, drive_md5, estado, versiones_anteriores")
        .eq("bucket", p.bucket).eq("ruta", p.ruta).maybeSingle();
      try {
        const descarga = await db.storage.from(p.bucket).download(p.ruta);
        if (descarga.error) throw new Error(`Bajar de Storage: ${descarga.error.message}`);
        const bytes = new Uint8Array(await descarga.data.arrayBuffer());
        bytesVuelta += bytes.byteLength;
        const md5Hex = await md5(bytes);
        const clave = (await sha256(`${p.bucket}/${p.ruta}`)).slice(0, 40);
        const partes = p.ruta.split("/");
        const nombre = partes.pop()!;
        const padre = await carpetaDe(db, d, cache, raiz, [p.bucket, ...partes].join("/"));

        const copia = (await d.buscarCopia(clave, md5Hex))
          ?? (await d.subir(bytes, p.mime ?? "application/octet-stream", nombre, padre,
                { erp_k: clave, erp_md5: md5Hex, erp_b: p.bucket.slice(0, 40) }, `ERP Servielectro · ${p.bucket}/${p.ruta}`));
        if (copia.md5Checksum !== md5Hex || Number(copia.size) !== bytes.byteLength) {
          throw new Error(`Drive no confirma la copia (MD5 ${copia.md5Checksum} contra ${md5Hex}, tamaño ${copia.size} contra ${bytes.byteLength}).`);
        }

        // Si el objeto cambió, la copia anterior queda en el historial (no se borra de Drive).
        const anteriores = (previa?.versiones_anteriores as unknown[]) ?? [];
        if (previa?.drive_file_id && previa.drive_file_id !== copia.id) {
          anteriores.push({ drive_file_id: previa.drive_file_id, drive_md5: previa.drive_md5, hasta: new Date().toISOString() });
        }
        const ahora = new Date().toISOString();
        const { error } = await db.from("respaldo_drive_archivos").upsert({
          bucket: p.bucket, ruta: p.ruta, origen_bytes: bytes.byteLength, origen_actualizado: p.actualizado, origen_md5: md5Hex,
          drive_file_id: copia.id, drive_md5: copia.md5Checksum, subido_en: ahora, verificado_en: ahora, estado: "respaldado",
          intentos: (previa?.intentos ?? 0) + 1, ultimo_error: null, versiones_anteriores: anteriores, actualizado_en: ahora,
        }, { onConflict: "bucket,ruta" });
        if (error) throw new Error(`Anotar la copia: ${error.message}`);
        await anotarEnReunion(db, p.bucket, p.ruta, { id: copia.id, md5: md5Hex });
        cuenta.subidos++;
      } catch (e) {
        if (e instanceof AutorizacionVencida) throw e;
        cuenta.errores++;
        const msj = String((e as Error).message ?? e).slice(0, 500);
        errores.push(`${p.bucket}/${p.ruta}: ${msj}`);
        await db.from("respaldo_drive_archivos").upsert({
          bucket: p.bucket, ruta: p.ruta, estado: previa?.estado === "respaldado" ? "respaldado" : "error",
          intentos: (previa?.intentos ?? 0) + 1, ultimo_error: msj, actualizado_en: new Date().toISOString(),
        }, { onConflict: "bucket,ruta" });
      }
      await latir();
    }

    return await cerrar(cuenta.errores ? "con_errores" : "ok", errores.length ? errores.slice(0, 5).join(" | ") : null);
  } catch (e) {
    if (e instanceof AutorizacionVencida) return await cerrar("autorizacion_vencida", e.message);
    return await cerrar("fallo", String((e as Error).message ?? e).slice(0, 500));
  }
});
