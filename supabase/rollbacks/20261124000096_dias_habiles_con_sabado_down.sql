-- Deshace 20261124000096: vuelve la regla de la 94 (lunes a viernes, el día del acta no cuenta) y
-- la versión 1 del acta de inicio. OJO: la regla de la 94 es la que Jhojan dijo que está mal.
-- La versión 2 solo se borra si ninguna acta la usa; si alguna la usa, queda archivada.

create or replace function public.fn_sumar_dias_habiles(p_desde date, p_dias int)
returns date language plpgsql stable set search_path = public as $$
declare
  d date := p_desde;
  n int := 0;
begin
  if p_desde is null or p_dias is null or p_dias < 1 then
    return null;
  end if;
  while n < p_dias loop
    d := d + 1;
    if extract(isodow from d) <= 5 and not exists (select 1 from festivos_colombia where fecha = d) then
      n := n + 1;
    end if;
  end loop;
  return d;
end;
$$;
revoke all on function public.fn_sumar_dias_habiles(date, int) from public, anon;
grant execute on function public.fn_sumar_dias_habiles(date, int) to authenticated, service_role;

create or replace function public.fn_sst_formato_calculos()
returns trigger language plpgsql set search_path = public as $$
declare
  v_campos jsonb;
  c jsonb;
  v_plazo int;
  v_valor text;
begin
  if tg_op = 'UPDATE' and (old.estado <> 'borrador' or fn_sst_formato_tiene_firmas(old.id)) then
    return new;
  end if;
  select p.campos into v_campos from sst_plantillas p where p.id = new.plantilla_id;
  if v_campos is null then
    return new;
  end if;
  for c in select x from jsonb_array_elements(v_campos) x where x ? 'calculado' loop
    v_valor := null;
    if c ->> 'calculado' = 'fecha_del_acta' then
      v_valor := new.fecha::text;
    elsif c ->> 'calculado' = 'terminacion_dias_habiles' then
      begin
        v_plazo := nullif(trim(new.respuestas ->> (c ->> 'plazo_campo')), '')::int;
      exception when others then
        v_plazo := null;
      end;
      v_valor := fn_sumar_dias_habiles(new.fecha, v_plazo)::text;
    end if;
    new.respuestas := case when v_valor is null then new.respuestas - (c ->> 'id')
                           else jsonb_set(new.respuestas, array[c ->> 'id'], to_jsonb(v_valor)) end;
  end loop;
  return new;
end;
$$;
revoke all on function public.fn_sst_formato_calculos() from public, anon, authenticated;
drop function if exists public.fn_sumar_dias_habiles(date, int, boolean);

update public.sst_plantillas set estado = 'publicada', archivada_en = null, motivo_archivo = null
where id = '00000000-0000-4000-8000-0000000094a1';
delete from public.sst_plantillas p
where p.id = '00000000-0000-4000-8000-0000000096a1' and not exists (select 1 from public.sst_formatos f where f.plantilla_id = p.id);
update public.sst_plantillas set estado = 'archivada', archivada_en = now(), motivo_archivo = 'Rollback de la migración 96.'
where id = '00000000-0000-4000-8000-0000000096a1';
