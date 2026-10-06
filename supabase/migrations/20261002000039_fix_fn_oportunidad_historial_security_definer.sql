-- Fix urgente, detectado al reverificar la tanda 2 (2026-10-02): fn_oportunidad_historial()
-- vivía en la base como SECURITY INVOKER (y con una versión más vieja y simplificada del
-- cuerpo, sin la lógica de usar el total real de la cotización), en vez de SECURITY
-- DEFINER como siempre dijo el archivo de la migración 27. Mientras oportunidad_etapas_
-- historial tuvo una política abierta (`using(true)`) no se notaba — cualquiera podía
-- escribir ahí igual. Al cerrar esa tabla a solo lectura en la tanda 2, el trigger (que
-- corre como quien hace el INSERT/UPDATE de la oportunidad, no como el dueño de la tabla)
-- empezó a chocar con la RLS y CUALQUIER alta o cambio de etapa de una oportunidad falla
-- con "new row violates row-level security policy for table oportunidad_etapas_historial".
--
-- Esta migración recrea la función exactamente como la definió la 27: security definer
-- (corre con los privilegios de quien la creó, no de quien dispara el trigger, así que no
-- depende de la RLS de la tabla) y con el valor real de la cotización cuando existe.
--
-- Idempotente.

create or replace function fn_oportunidad_historial()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_valor numeric;
begin
  if tg_op = 'UPDATE'
     and new.etapa_id is not distinct from old.etapa_id
     and new.estado is not distinct from old.estado then
    return null;
  end if;

  select coalesce(
    (select t.total_cotizacion from v_cotizacion_totales_iva t where t.cotizacion_id = new.cotizacion_id),
    new.valor_estimado
  ) into v_valor;

  update oportunidad_etapas_historial
     set fecha_salida = now()
   where oportunidad_id = new.id and fecha_salida is null;

  insert into oportunidad_etapas_historial (oportunidad_id, etapa_id, estado, fecha_entrada, valor, usuario_id)
  values (new.id, new.etapa_id, new.estado, now(), v_valor, auth.uid());

  return null;
end;
$$;
