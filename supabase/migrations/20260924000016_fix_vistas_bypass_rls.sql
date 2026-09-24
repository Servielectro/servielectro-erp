-- Módulo 1: Proyectos — CORRECCIÓN DE SEGURIDAD CRÍTICA: las vistas estaban
-- ignorando la RLS por completo, exponiendo datos a CUALQUIERA sin sesión.
-- Idempotente: se puede correr más de una vez sin romper.
--
-- Hallazgo (2026-09-24): en Postgres, una vista sin `security_invoker = true`
-- se ejecuta con los privilegios de quien la CREÓ (acá: el rol usado para correr
-- las migraciones), no con los del rol que hace la consulta. Ese rol tiene
-- permiso para saltarse la RLS de las tablas base, así que TODAS las vistas de
-- este proyecto devolvían filas reales a cualquiera con la publishable key —
-- sin sesión, sin usuario, sin nada — porque esa clave es pública por diseño
-- (viaja en el bundle del navegador).
--
-- Verificado en vivo antes de escribir esta migración: la tabla items_catalogo
-- (815 filas reales) devolvía [] sin sesión (la RLS de la tabla funciona bien),
-- pero la vista v_items_catalogo_con_precio devolvía las 815 filas completas
-- —incluyendo costos de compra— sin ninguna autenticación.
--
-- La corrección: `security_invoker = true` hace que la vista se ejecute con los
-- permisos de QUIEN CONSULTA, no de quien la creó — ahí sí respeta la RLS de las
-- tablas base como se esperaba desde el principio.

alter view v_items_precio_actual set (security_invoker = true);
alter view v_items_catalogo_con_precio set (security_invoker = true);
alter view v_cotizacion_totales set (security_invoker = true);
alter view v_cotizacion_totales_iva set (security_invoker = true);
alter view v_capas_utilidad set (security_invoker = true);
alter view v_presupuesto_vs_ejecucion set (security_invoker = true);
alter view v_ejecucion_sin_presupuesto set (security_invoker = true);
alter view v_flujo_caja set (security_invoker = true);
alter view v_flujo_caja_saldo set (security_invoker = true);
alter view v_cobros_pendientes set (security_invoker = true);
alter view v_cotizaciones_listado set (security_invoker = true);
alter view v_hitos_cotizacion set (security_invoker = true);
alter view v_rut_vigente_cliente set (security_invoker = true);
