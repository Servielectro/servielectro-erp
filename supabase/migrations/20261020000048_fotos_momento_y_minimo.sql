-- Fotos con momento (antes / durante / después) y mínimo diario por visita.
--
-- 1) YA APLICADAS a mano por el usuario (2026-10-20); quedan acá registradas. Con
--    "if not exists" no cambian nada si se vuelven a correr.
alter table public.visita_fotos
  add column if not exists momento text check (momento in ('antes', 'durante', 'despues'));
alter table public.visitas
  add column if not exists fotos_minimas_dia smallint;  -- null = sin mínimo

-- 2) NUEVO (esto es lo único que hay que correr): qué pasó al cerrar la jornada.
--    El mínimo no bloquea la salida —un técnico bloqueado toma diez fotos del piso para
--    poder irse—: avisa y pide un motivo, y queda registrado. "Cerró con 4 de 10, motivo:
--    …" es información para Jhojan; quien lo haga seguido se nota solo.
alter table public.visita_jornadas
  add column if not exists fotos_al_salir text;             -- "4 de 10 · 2 antes, 2 durante, 0 después"
alter table public.visita_jornadas
  add column if not exists motivo_fotos_incompletas text;   -- null = cerró completa

-- Rollback: supabase/rollbacks/20261020000048_fotos_momento_y_minimo_down.sql
