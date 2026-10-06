-- Rollback de 20261002000039: vuelve a la versión que había antes (security invoker,
-- sin el total real de la cotización). Ojo: esa versión rompe la creación de oportunidades
-- mientras oportunidad_etapas_historial tenga RLS cerrada (tanda 2 en adelante).
create or replace function fn_oportunidad_historial()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and new.etapa_id is not distinct from old.etapa_id
     and new.estado is not distinct from old.estado then
    return new;
  end if;

  update oportunidad_etapas_historial
     set fecha_salida = now()
   where oportunidad_id = new.id and fecha_salida is null;

  insert into oportunidad_etapas_historial
    (oportunidad_id, etapa_id, estado, valor, usuario_id)
  values (new.id, new.etapa_id, new.estado, new.valor_estimado, auth.uid());

  return new;
end;
$$;
