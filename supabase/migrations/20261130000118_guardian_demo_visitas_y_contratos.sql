-- Guardián del usuario demo: faltaban dos tablas, y eran las que más importaban (2026-10-29).
-- Escrita y aplicada por el orquestador. Idempotente.
--
-- La 116 dejó el guardián puesto en 8 tablas en vez de 10, y no avisó. Dos motivos, los dos míos:
--   * `visitas` usa `creada_por`, no `creado_por`. Yo escribí el nombre de memoria.
--   * `proyecto_contratos` simplemente se me quedó fuera de la lista.
--
-- Y son justo las dos que guardan lo que menos se puede perder: la visita de Miguel y el contrato
-- de Tintalá con su valor, su forma de pago y la cédula del administrador de la copropiedad.
--
-- Lo encontré contando cuántos triggers habían quedado puestos y comparando con los que esperaba.
-- La 116 usaba `if exists (columna)` y seguía de largo en silencio cuando no la encontraba: por eso
-- no falló, simplemente no protegió. Aquí es al revés — si la columna no existe, **revienta**.
-- Una protección que se salta sin avisar es peor que no tenerla, porque uno cree que está puesta.

do $$
declare
  pares text[][] := array[ ['visitas','creada_por'], ['proyecto_contratos','creado_por'] ];
  i int; t text; col text;
begin
  for i in 1 .. array_length(pares, 1) loop
    t := pares[i][1]; col := pares[i][2];
    if not exists (select 1 from information_schema.columns
                   where table_schema='public' and table_name=t and column_name=col) then
      raise exception 'No existe %.% — revisar antes de seguir', t, col;
    end if;
    execute format('drop trigger if exists trg_demo_guardian on public.%I', t);
    execute format(
      'create trigger trg_demo_guardian before update or delete on public.%I
       for each row execute function public.fn_demo_no_toca_lo_ajeno(%L)', t, col);
  end loop;
end $$;
