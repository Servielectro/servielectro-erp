# Servielectro ERP — Módulo 1: Proyectos

ERP interno de Servielectro SAS. Next.js + Supabase + Vercel, PWA instalable (funciona en Windows y en tablet Android desde el navegador).

## Estado actual

Login contra Supabase, pantalla de cotización mobile-first (`/cotizaciones/nueva`), y el modelo de datos completo en `supabase/migrations/`. Proyectos, ejecución, hitos de cobro y flujo de caja tienen su modelo de datos listo pero todavía no tienen pantalla.

Diseño del modelo de costos y pendientes: `docs/ERP-Servielectro-Modulo1-Proyectos.md`.

## 1. Crear el proyecto en Supabase

1. Entrar a https://supabase.com/dashboard y crear un **proyecto nuevo** (no reutilizar el de Terra Perfumería). Nombre sugerido: `servielectro-erp`. Región: la más cercana a Bogotá (ej. `sa-east-1` São Paulo, o `us-east-1` si no hay una en Suramérica).
2. Guardar la contraseña de la base de datos en un lugar seguro (no se comparte con el asistente).
3. En **Project Settings → API**, copiar:
   - `Project URL`
   - `Publishable key` (Supabase renombró la antigua `anon`/`public` key a **`publishable`** — es la misma idea, se puede exponer al navegador).
   - Pasar esas dos al asistente. **La `secret key` (antes `service_role`) NO se comparte por chat** — esa se pega directamente en Vercel cuando haga falta.
4. En **SQL Editor**, ejecutar en orden los archivos de `supabase/migrations/` (del número más bajo al más alto). Cada uno es idempotente: se puede volver a correr sin romper si algo falla a mitad de camino.
5. Si algo sale mal y hay que deshacer una migración, está su contraparte en `supabase/rollbacks/` con el mismo número.

## 2. Variables de entorno locales

```
cp .env.local.example .env.local
```

Completar `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` con los valores del paso anterior.

> **Nombres unificados:** en el código y en `.env` siempre se usa `PUBLISHABLE_KEY` (nunca `ANON_KEY`), siguiendo el renombre que hizo Supabase. Si en el dashboard de Supabase todavía aparece como "anon" / "public", es la misma clave.

## 3. Crear el primer usuario

En Supabase: **Authentication → Users → Add user** (con el correo y contraseña que va a usar Jhojan para entrar al ERP). Por ahora el login es con correo/contraseña, no hay registro público.

## 4. Correr en local

```
npm install
npm run dev
```

Abrir http://localhost:3000 — debería pedir login y luego mostrar la pantalla base.

## 5. Desplegar en Vercel

```
vercel
```

(la PC ya tiene Vercel autenticado). Agregar las mismas variables de entorno (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`) en el proyecto de Vercel, en Settings → Environment Variables.

## Estructura

```
supabase/migrations/   Migraciones SQL versionadas (aplicar en orden)
supabase/rollbacks/    Reversa de cada migración (mismo número)
docs/                  Diseño del módulo de costos
src/app/               Next.js App Router
src/lib/supabase/      Clientes de Supabase (browser, server, middleware)
```
