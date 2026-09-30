-- Módulo Licitaciones — alta en el sistema de módulos, EN CONSTRUCCIÓN (2026-09-30).
--
-- Jhojan tiene un motor con GPT que busca licitaciones en SECOP II; lo va a traer para
-- definirlo después. Por ahora solo existe el módulo (pantalla "En construcción"), sin
-- modelo de datos propio.
--
-- Mismo patrón que la migración 23: el módulo es una fila de `modulos`, y el rol
-- Administrador queda como responsable (con datos sensibles), igual que en el resto.
-- Los demás roles no lo ven hasta que se les marque en Configuración → Usuarios.
--
-- Idempotente.

insert into modulos (id, nombre, orden)
values ('licitaciones', 'Licitaciones', 9)
on conflict (id) do update set nombre = excluded.nombre, orden = excluded.orden;

insert into permisos_rol (rol_id, modulo_id, nivel, ve_datos_sensibles)
select r.id, 'licitaciones', 'responsable', true
from roles r
where r.nombre = 'Administrador'
on conflict (rol_id, modulo_id) do nothing;
