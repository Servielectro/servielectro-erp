@AGENTS.md

# Reglas del proyecto

## Autenticación: sin atajos controlados por variables de entorno

Nunca agregar atajos de depuración que desactiven el login (middleware, redirect a `/login`, RLS) controlados por una variable de entorno (`process.env.ALGO`). Las variables de entorno pueden viajar al servidor (`.env.local` subido por `vercel --prod`, una variable cargada por error en Vercel) y dejar el ERP abierto a cualquiera con la URL: costos, márgenes y datos de clientes.

Si hace falta ver la UI sin sesión en local, que sea imposible de activar fuera de desarrollo local: por ejemplo, exigir `process.env.NODE_ENV === "development"` (que `next build` nunca produce) **y** además no commitear el cambio. Antes de desplegar, `grep` por cualquier condición que saltee `if (!user)`.
