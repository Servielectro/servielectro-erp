-- Días hábiles con sábado y con el inicio que dice el acta (2026-10-27). Corrige la 94.
--
-- Jhojan respondió los dos supuestos de la 94, y los dos estaban al revés:
--   "Si, los sabados se trabajan. Cuenta como día de trabajo cuando se ponga el inicio de labores.
--    Si en el acta se pone que se inicia de inmediato el mismo día, cuenta, si se pone que se
--    inicia el siguiente día, cuenta a partir del siguiente día."
--
--   1. El SÁBADO ES HÁBIL: lunes a sábado, sin festivos de Colombia.
--   2. Si el día del acta cuenta NO es una constante: lo dice el acta, en un campo obligatorio
--      "Inicio de labores" (el mismo día del acta / el día siguiente al acta).
--
-- Con eso, un acta del jueves 29/10/2026 con 12 días hábiles que inicia al día siguiente vence el
-- viernes 13/11 (no el 18/11 que daba la 94): cuenta los sábados 31/10 y 7/11 y salta los
-- festivos del 2 y el 16. Si inicia el mismo día, vence el 12/11.
--
-- La plantilla publicada no se edita: sale la VERSIÓN 2 del acta de inicio (con el campo nuevo y
-- la fecha de inicio oficial = el primer día que cuenta) y la versión 1 se archiva. Un acta ya
-- creada con la versión 1 no tiene "inicio de labores": la base no le calcula la terminación (no
-- se inventa); se rehace con la versión 2.
--
-- La regla vive en dos lugares que tienen que decir lo mismo: fn_sumar_dias_habiles (base) y
-- src/lib/fechas/dias-habiles.ts (celular).
--
-- Va después de la 94. Idempotente.
-- Verificación: supabase/verificaciones/20261124000096_verificar.sql
-- Rollback:     supabase/rollbacks/20261124000096_dias_habiles_con_sabado_down.sql

-- ============================================================ 1) la regla
-- p_dias días hábiles (lunes a sábado, sin festivos). Si p_inicia_mismo_dia, el día del acta es el
-- primero que cuenta (si es hábil); si no, se empieza a contar el día siguiente. Devuelve el
-- último día del plazo. Con p_dias = 1 devuelve el primer día que cuenta (el inicio de labores).
drop function if exists public.fn_sumar_dias_habiles(date, int);
create or replace function public.fn_sumar_dias_habiles(p_desde date, p_dias int, p_inicia_mismo_dia boolean)
returns date
language plpgsql
stable
set search_path = public
as $$
declare
  d date;
  n int := 0;
begin
  if p_desde is null or p_dias is null or p_dias < 1 or p_inicia_mismo_dia is null then
    return null;
  end if;
  d := case when p_inicia_mismo_dia then p_desde - 1 else p_desde end;
  while n < p_dias loop
    d := d + 1;
    if extract(isodow from d) <= 6 and not exists (select 1 from festivos_colombia where fecha = d) then
      n := n + 1;
    end if;
  end loop;
  return d;
end;
$$;

-- ============================================================ 2) los campos calculados
create or replace function public.fn_sst_formato_calculos()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_campos jsonb;
  c jsonb;
  v_plazo int;
  v_mismo boolean;
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
    -- Inicio de labores: "El mismo día del acta" / "El día siguiente al acta". Sin elegir, no se calcula.
    v_mismo := case new.respuestas ->> (c ->> 'inicio_campo')
                 when 'El mismo día del acta' then true
                 when 'El día siguiente al acta' then false
               end;
    begin
      v_plazo := nullif(trim(new.respuestas ->> (c ->> 'plazo_campo')), '')::int;
    exception when others then
      v_plazo := null;
    end;
    if c ->> 'calculado' = 'fecha_del_acta' then
      v_valor := new.fecha::text;
    elsif c ->> 'calculado' = 'inicio_dias_habiles' then
      v_valor := fn_sumar_dias_habiles(new.fecha, 1, v_mismo)::text;
    elsif c ->> 'calculado' = 'terminacion_dias_habiles' then
      v_valor := fn_sumar_dias_habiles(new.fecha, v_plazo, v_mismo)::text;
    end if;
    new.respuestas := case when v_valor is null then new.respuestas - (c ->> 'id')
                           else jsonb_set(new.respuestas, array[c ->> 'id'], to_jsonb(v_valor)) end;
  end loop;
  return new;
end;
$$;

-- ============================================================ 3) versión 2 del acta de inicio
-- Campos de la versión 1 con: "Inicio de labores" (obligatorio) antes del plazo; la fecha de
-- inicio oficial pasa a ser el primer día que cuenta; la terminación usa el inicio elegido.
insert into public.sst_plantillas (id, ambito, codigo, nombre, version, plantilla_anterior_id, descripcion, estado, publicada_en, campos, firmas)
select '00000000-0000-4000-8000-0000000096a1', v1.ambito, v1.codigo, v1.nombre, 2, v1.id, v1.descripcion, 'publicada', now(),
  (select jsonb_agg(x order by o)
   from (
     select o, case x ->> 'id'
       when 'fecha_inicio_oficial' then x || jsonb_build_object(
         'calculado', 'inicio_dias_habiles', 'inicio_campo', 'inicio_labores',
         'ayuda', 'El primer día que cuenta: el del acta si las labores inician ese mismo día; si no, el siguiente día hábil.')
       when 'fecha_terminacion_estimada' then x || jsonb_build_object(
         'inicio_campo', 'inicio_labores',
         'ayuda', 'Días hábiles: lunes a sábado, sin festivos de Colombia, contados desde el inicio de labores.')
       else x end as x
     from jsonb_array_elements(v1.campos) with ordinality e(x, o)
     union all
     -- justo antes del plazo
     select (select o2 from jsonb_array_elements(v1.campos) with ordinality e2(x2, o2) where x2 ->> 'id' = 'plazo_dias_habiles') - 0.5,
       '{"id": "inicio_labores", "tipo": "lista", "etiqueta": "Inicio de labores", "obligatorio": true,
         "opciones": ["El mismo día del acta", "El día siguiente al acta"],
         "ayuda": "De aquí sale desde qué día cuenta el plazo (y la multa)."}'::jsonb
   ) t),
  v1.firmas
from public.sst_plantillas v1
where v1.id = '00000000-0000-4000-8000-0000000094a1'
on conflict do nothing;

-- La versión 1 se archiva (la base no deja dos vigentes con la misma regla a medias).
update public.sst_plantillas
set estado = 'archivada', archivada_en = now(),
    motivo_archivo = 'Reemplazada por la versión 2: sábado hábil e inicio de labores elegido en el acta (Jhojan, 2026-10-27).'
where id = '00000000-0000-4000-8000-0000000094a1' and estado = 'publicada'
  and exists (select 1 from public.sst_plantillas where id = '00000000-0000-4000-8000-0000000096a1');

-- ============================================================ 4) privilegios
revoke all on function public.fn_sumar_dias_habiles(date, int, boolean) from public, anon;
grant execute on function public.fn_sumar_dias_habiles(date, int, boolean) to authenticated, service_role;
revoke all on function public.fn_sst_formato_calculos() from public, anon, authenticated;
