-- Módulo 1: Proyectos — extensiones y tipos base
-- Idempotente: se puede correr más de una vez sin romper (ver nota de Terra Card).
create extension if not exists "pgcrypto";
create extension if not exists "moddatetime" schema extensions;

-- Postgres no soporta "CREATE TYPE IF NOT EXISTS" — se usa el patrón estándar
-- de capturar duplicate_object para que sea idempotente.
do $$ begin
  create type categoria_item as enum ('EQUIPO', 'MATERIAL', 'MANO_DE_OBRA');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type tipo_contrato as enum ('OBRA_CIVIL', 'MANTENIMIENTO', 'SUMINISTRO');
exception when duplicate_object then null;
end $$;

-- Interruptor explícito de IVA por cotización (decisión de Jhojan: "eso cambia todo de ahí
-- para abajo", debe elegirse primero). Reemplaza la derivación automática desde tipo_contrato.
do $$ begin
  create type esquema_iva as enum ('IVA_FULL', 'IVA_AIU');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type estado_cotizacion as enum ('BORRADOR', 'ENVIADA', 'APROBADA', 'RECHAZADA');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type estado_proyecto as enum ('EN_EJECUCION', 'CERRADO', 'SUSPENDIDO');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type estado_hito as enum ('PENDIENTE', 'FACTURADO', 'COBRADO');
exception when duplicate_object then null;
end $$;
