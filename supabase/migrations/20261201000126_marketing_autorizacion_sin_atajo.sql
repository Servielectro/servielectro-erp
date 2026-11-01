-- El candado de autorización de la 125 no lleva atajo para postgres (2026-10-30).
-- Escrita y aplicada por el orquestador. Idempotente.
--
-- La 125 lo escribió con el `if current_user in ('postgres','supabase_admin') then return new;`
-- que usan casi todos los triggers de la casa. Ahí ese atajo está bien: son reglas de proceso y
-- las migraciones necesitan poder sembrar datos sin pelear con ellas.
--
-- Este no es una regla de proceso. Es la que impide publicar la instalación de seguridad de un
-- cliente sin su permiso, y eso no se puede deshacer: una vez publicado, ya lo vio quien lo tenía
-- que ver. El mismo día encontré el mismo patrón en la historia clínica (migración 110) y la
-- conclusión es la misma: una protección que se salta sin avisar es peor que no tenerla.
--
-- No puede ser un CHECK porque mira otra tabla, así que se queda en trigger, pero sin atajo. Y de
-- paso ahora SÍ se puede probar.
create or replace function public.fn_marketing_aprobar_reglas()
returns trigger language plpgsql set search_path = public as $$
declare v_sin text;
begin
  if new.estado in ('aprobada','programada','publicada')
     and (tg_op = 'INSERT' or old.estado not in ('aprobada','programada','publicada')) then
    select string_agg(b.titulo, ', ') into v_sin
    from marketing_piezas p
    join marketing_biblioteca b on b.id = p.biblioteca_id
    where p.idea_id = new.id and b.identificable and b.autorizacion <> 'concedida';
    if v_sin is not null then
      raise exception 'No se puede aprobar: hay material identificable de un cliente sin autorización (%). Publicar la instalación de seguridad de un cliente lo expone.', v_sin;
    end if;
    if new.aprobada_por is null and auth.uid() is not null then
      new.aprobada_por := auth.uid();
      new.aprobada_en := now();
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.fn_marketing_aprobar_reglas() from public, anon, authenticated;
