import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Comparación exacta, no startsWith: con un prefijo, cualquier ruta futura que empiece por
  // "/login" (por ejemplo "/login-proveedores") quedaría abierta sin sesión. Las otras rutas
  // públicas son la lista literal RUTAS_PUBLICAS de src/proxy.ts.
  const isAuthRoute = request.nextUrl.pathname === "/login";

  if (!user && !isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    // Se recuerda a dónde iba, para volver ahí después de entrar.
    url.search = "";
    const destino = request.nextUrl.pathname + request.nextUrl.search;
    if (destino !== "/") url.searchParams.set("next", destino);
    return NextResponse.redirect(url);
  }

  return response;
}
