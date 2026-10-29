-- La historia clínica, reservada por restricción y no solo por trigger (2026-10-29).
-- Escrita y aplicada por el orquestador. Idempotente.
--
-- La 107 fuerza `reservado := true` para tipo = 'historia_clinica' desde
-- fn_persona_documentos_reglas. Está bien, pero esa función empieza con:
--
--     if current_user in ('postgres', 'supabase_admin') then return coalesce(new, old); end if;
--
-- Ese atajo existe por buenas razones (las migraciones y las siembras tienen que poder escribir sin
-- pelear con las reglas), pero significa que la protección del dato más sensible del sistema se cae
-- por cualquier camino privilegiado: una migración, un script con service_role, o yo mismo corriendo
-- SQL desde aquí. Lo encontré probándolo: inserté una historia clínica con reservado = false y
-- entró abierta.
--
-- Con `reservado = false` el documento se sale del alcance de las políticas que lo protegen: lo vería
-- RRHH "trabajar" y cualquiera con SG-SST "consultar" SIN el permiso de datos sensibles, y su archivo
-- no caería en la carpeta reservado/. Un diagnóstico médico es dato de salud, con protección
-- reforzada en Colombia; no debería depender de qué rol escribió la fila.
--
-- Una CHECK no la salta nadie: ni postgres, ni service_role, ni un trigger. El trigger de la 107 se
-- queda como está (sigue siendo la comodidad: pone el valor solo); esto es el piso que no se hunde.
--
-- No rompe nada existente: hoy no hay ninguna fila de tipo historia_clinica.
--   select count(*) from persona_documentos where tipo = 'historia_clinica' and not reservado;  -- 0

alter table public.persona_documentos
  drop constraint if exists persona_documentos_historia_reservada;

alter table public.persona_documentos
  add constraint persona_documentos_historia_reservada
  check (tipo <> 'historia_clinica' or reservado);

comment on constraint persona_documentos_historia_reservada on public.persona_documentos is
  'Una historia clinica no puede quedar abierta ni por un camino privilegiado. El trigger la marca; esto lo garantiza.';
