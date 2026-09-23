-- Módulo 1: Proyectos — extensiones y tipos base
create extension if not exists "pgcrypto";
create extension if not exists "moddatetime" schema extensions;

create type categoria_item as enum ('EQUIPO', 'MATERIAL', 'MANO_DE_OBRA');

create type tipo_contrato as enum ('OBRA_CIVIL', 'MANTENIMIENTO', 'SUMINISTRO');

create type estado_cotizacion as enum ('BORRADOR', 'ENVIADA', 'APROBADA', 'RECHAZADA');

create type estado_proyecto as enum ('EN_EJECUCION', 'CERRADO', 'SUSPENDIDO');

create type estado_hito as enum ('PENDIENTE', 'FACTURADO', 'COBRADO');
