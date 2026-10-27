-- Rollback de la migración 76. OJO: borra todas las notificaciones, las preferencias de cada
-- persona y los dispositivos registrados para el aviso al celular. Los eventos (abonos, permisos,
-- tareas…) no se tocan: solo dejan de avisar.
drop trigger if exists trg_notif_tarea_asignada on public.tarea_asignados;
drop trigger if exists trg_notif_tarea_compartida on public.tarea_participantes;
drop trigger if exists trg_notif_abono on public.abonos;
drop trigger if exists trg_notif_permiso on public.permisos_laborales;
drop trigger if exists trg_notif_gasto on public.gastos;
drop trigger if exists trg_notif_documento on public.documentos_personal;
drop trigger if exists trg_notif_caja_menor on public.caja_menor_recibos;
drop function if exists public.fn_notif_tarea_asignada();
drop function if exists public.fn_notif_tarea_compartida();
drop function if exists public.fn_notif_abono();
drop function if exists public.fn_notif_permiso();
drop function if exists public.fn_notif_gasto();
drop function if exists public.fn_notif_documento();
drop function if exists public.fn_notif_caja_menor();
drop function if exists public.fn_notificar(uuid, text, text, text, text, text, uuid, boolean);
drop function if exists public.fn_notif_nombre(uuid);
drop function if exists public.fn_notif_aprobadores(text);
drop function if exists public.fn_notif_con_permiso(text, nivel_permiso);
drop function if exists public.fn_notif_miembros_grupo(uuid);
drop function if exists public.fn_notif_perfil_de_empleado(uuid);
drop function if exists public.fn_notif_ruta_tarea(uuid, text);
drop table if exists public.notificacion_suscripciones;
drop table if exists public.notificacion_preferencias;
drop table if exists public.notificaciones;
drop table if exists public.notificacion_tipos;
