import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// POR QUÉ EXISTE ESTA LISTA: Google no deja publicar la app de OAuth "Servielectro ERP" (la que
// autoriza el respaldo a Drive con drive.file, supabase/functions/respaldar-drive) sin una URL de
// página principal y una URL de política de privacidad accesibles sin login. Son estas dos, y están
// pegadas en Google Cloud → Información de la marca. Si se quitan, Google puede despublicar la app y
// el respaldo deja de correr.
//
// AGREGAR UNA TERCERA RUTA AQUÍ ES ABRIR EL ERP: todo lo que no está en esta lista exige sesión, y
// detrás están costos, márgenes y datos de clientes. No se agregan rutas aquí "para probar".
//
// Comparación EXACTA contra esta lista literal: nada de prefijos, patrones ni variables de entorno
// (CLAUDE.md). "/inicio/x", "/privacidad/x" o "/Inicio" no entran: van a login. Las páginas viven
// en src/app/(publico) y no leen la base ni la sesión. La otra ruta sin sesión es /login, también
// por comparación exacta, en src/lib/supabase/middleware.ts.
const RUTAS_PUBLICAS: ReadonlySet<string> = new Set(["/inicio", "/privacidad"]);

export async function proxy(request: NextRequest) {
  if (RUTAS_PUBLICAS.has(request.nextUrl.pathname)) return NextResponse.next();

  // La ruta pedida, para que el layout sepa a qué sección se está entrando (permisos por sección,
  // migración 122). No decide nada aquí: el login sigue siendo lo único que hace este proxy.
  request.headers.set("x-ruta", request.nextUrl.pathname);
  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw\\.js|pdfjs/|icon-.*\\.png|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
