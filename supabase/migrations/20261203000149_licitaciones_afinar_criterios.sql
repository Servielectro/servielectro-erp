-- Licitaciones: primer afinado del radar con Jhojan, y arreglo del recálculo (2026-11-08).
--
-- ------------------------------------------------------------------ lo que se apaga
-- 72154000 (cercas). Jhojan: «sácalo». En SECOP esa clase es cajón de sastre: PTAP, tanques de
--   agua, aseo, obra civil, aires acondicionados. Y como la actividad se compara por los primeros 6
--   dígitos, arrastra todo 721540xx. Trajo un aviso comercial en un hangar y un mantenimiento de
--   equipos de cómputo; ninguna cerca. El problema es el código, no la línea: moverlo no lo arregla.
--
-- CAMARAS (seguridad_electronica). Jhojan: «quita la palabra y probamos cómo va».
--   NO LA VUELVAN A PRENDER PENSANDO QUE ES INOFENSIVA. El plural pesca «Confederación Colombiana de
--   Cámaras de Comercio». La 143 la cargó asegurando que «Cámara de Comercio» no entraba, porque
--   solo se había probado el singular; el plural sí calza. Se mantienen CAMARA DE SEGURIDAD,
--   CAMARAS DE SEGURIDAD, CAMARA DE VIDEO y CAMARA IP. (Consecuencia: la comprobación de la 143
--   «cada palabra confirmada quedó activa» ya no pasaría si alguien la re-ejecuta. No se re-ejecuta.)
--
-- ------------------------------------------------------------------ lo que NO se toca, y por qué
-- ALARMA se queda tal cual. Jhojan: «en cuanto a la alarma, sí, hacemos todo eso». Servielectro
--   hace detección y alarma de incendio y sistemas de evacuación: TransMilenio (red contra
--   incendios), Metrosalud y el kit de alarma de emergencia son su negocio, no ruido.
-- Vigilancia privada (INPEC, ESAP, Defensoría, por CCTV y CIRCUITO CERRADO) se queda visible.
--   Jhojan: «déjalo porque de pronto tengo la alianza con la empresa para que se presente». Es un
--   negocio distinto, no ruido. OPCIÓN FUTURA, sin construir: palabras de exclusión en el radar.
--
-- ------------------------------------------------------------------ el arreglo
-- fn_licitaciones_recalcular (143) filtraba lo abierto con
--   secop->>'fecha_de_recepcion_de' !~ '…' or (…)::timestamp >= localtimestamp
-- Sin fecha de cierre eso da NULL y la fila se saltaba EN SILENCIO: alcanzaba 27 de 109 procesos.
-- El régimen especial simple nunca trae cierre en SECOP (0 de 161.192 desde sep-2026). Cambiar un
-- criterio o abrir una ciudad no recalculaba casi nada de lo que Jhojan puede hacer.

do $$
declare v text;
begin
  if not exists (select 1 from public.licitacion_criterios where tipo = 'categoria' and valor = '72154000') then
    raise exception 'No está el criterio 72154000.';
  end if;
  if not exists (select 1 from public.licitacion_criterios where tipo = 'palabra' and public.fn_licitacion_norm(valor) = 'camaras') then
    raise exception 'No está la palabra CAMARAS.';
  end if;
  select string_agg(n.valor, ', ') into v
  from (values ('CAMARA DE SEGURIDAD'), ('CAMARAS DE SEGURIDAD'), ('CAMARA DE VIDEO'), ('CAMARA IP'), ('ALARMA')) n(valor)
  where not exists (select 1 from public.licitacion_criterios c where c.tipo = 'palabra' and c.activo
                    and public.fn_licitacion_norm(c.valor) = public.fn_licitacion_norm(n.valor));
  if v is not null then
    raise exception 'Palabras que deben seguir activas y no lo están: %.', v;
  end if;
end $$;

update public.licitacion_criterios
   set activo = false,
       nota = coalesce(nullif(trim(nota), '') || ' · ', '')
              || 'Desactivado el 2026-11-08 (migración 149), Jhojan: «sácalo». En SECOP esta clase es cajón de sastre (PTAP, tanques, aseo, obra civil, aires) y, como se compara por 6 dígitos, arrastra todo 721540xx.'
 where tipo = 'categoria' and valor = '72154000' and activo;

update public.licitacion_criterios
   set activo = false,
       nota = coalesce(nullif(trim(nota), '') || ' · ', '')
              || 'Desactivada el 2026-11-08 (migración 149), Jhojan: «quita la palabra y probamos cómo va». NO es inofensiva: el plural pesca «Confederación Colombiana de Cámaras de Comercio». Se había asegurado que no pasaría porque solo se probó el singular.'
 where tipo = 'palabra' and public.fn_licitacion_norm(valor) = 'camaras' and activo;

-- Mismo cuerpo de la 143; cambia solo la condición de «sigue abierto»: sin fecha de cierre, cuenta.
create or replace function public.fn_licitaciones_recalcular()
returns int language plpgsql security definer set search_path = public set timezone = 'America/Bogota' as $$
declare l record; r record; v_n int := 0;
begin
  -- Ojo: dentro de security definer, current_user es el dueño de la función, no quien llama.
  -- Sin usuario conectado (auth.uid() null) = la Edge Function con clave de servicio o pg_cron.
  if auth.uid() is not null
     and not coalesce(fn_tiene_permiso_seccion('licitaciones', 'criterios', 'responsable'), false) then
    raise exception 'Recalcular la relevancia es de quien es responsable de los criterios.';
  end if;
  for l in select id, secop, afinidad, criterios_que_coinciden, actividad_por, lineas_que_calzaron
           from licitaciones
           where secop is not null
             and (coalesce(secop ->> 'fecha_de_recepcion_de', '') !~ '^\d{4}-\d{2}-\d{2}'
                  or (secop ->> 'fecha_de_recepcion_de')::timestamp >= localtimestamp)
  loop
    select * into r from fn_licitacion_relevancia(l.secop);
    if r.afinidad is distinct from l.afinidad::int or r.criterios is distinct from l.criterios_que_coinciden
       or r.actividad_por is distinct from l.actividad_por
       or r.lineas is distinct from l.lineas_que_calzaron then
      update licitaciones set afinidad = r.afinidad, criterios_que_coinciden = r.criterios, actividad_por = r.actividad_por,
                              lineas_que_calzaron = r.lineas
       where id = l.id;
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end $$;
