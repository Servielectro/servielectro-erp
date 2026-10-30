import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  // La ruta pedida, para que el layout sepa a qué sección se está entrando (permisos por sección,
  // migración 122). No decide nada aquí: el login sigue siendo lo único que hace este proxy.
  request.headers.set("x-ruta", request.nextUrl.pathname);
  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw\\.js|icon-.*\\.png|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
