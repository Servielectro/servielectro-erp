-- Corrección del disparador de 20261103120000.
--
-- La versión anterior escribía path = 'formatos/<id>/for02.pdf' en persona_documentos.
-- Eso viola dos CHECK de esa tabla:
--   persona_documentos_ruta             -> exige 'personas/e-<empleado_id>/...'
--   persona_documentos_archivo_completo -> path, sha256 y mime: los tres o ninguno
-- Resultado: sellar un FOR-02 habría reventado con excepción justo al cerrar la
-- capacitación. Se detectó probando el sellado contra un formato desechable.
--
-- La constancia no duplica el archivo: la evidencia es el propio FOR-02,
-- que queda citado en notas. Por eso path, sha256 y mime van en NULL.

create or replace function public.fn_sst_capacitacion_a_hojas_de_vida()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_codigo text;
  v_tema   text;
  v_horas  numeric;
  v_fecha  date;
  v_fila   record;
  v_emp    uuid;
  v_nota   text;
begin
  if new.estado not in ('firmado','aprobado') then
    return new;
  end if;
  if old.estado = new.estado then
    return new;
  end if;

  select pl.codigo into v_codigo
  from public.sst_plantillas pl
  where pl.id = new.plantilla_id;

  if v_codigo is distinct from 'FOR-02' then
    return new;
  end if;

  v_tema  := nullif(trim(new.respuestas->>'tema'), '');
  v_horas := nullif(new.respuestas->>'intensidad_horas', '')::numeric;
  v_fecha := new.fecha;

  if v_tema is null then
    raise exception 'El FOR-02 % no puede sellarse sin tema de la capacitación.', new.id;
  end if;

  -- persona_documentos_horas_check exige horas > 0 cuando no es nulo.
  if v_horas is not null and v_horas <= 0 then
    v_horas := null;
  end if;

  v_nota := 'Generado automáticamente al sellar el FOR-02 ' || new.id::text;

  for v_fila in
    select f.nombre, f.documento, f.cargo
    from public.sst_formato_firmas f
    where f.formato_id = new.id and f.rol = 'tecnico'
  loop
    -- Se busca al empleado por cédula. Si es alguien externo, no se inventa ficha.
    select e.id into v_emp
    from public.empleados e
    where regexp_replace(coalesce(e.numero_documento,''), '\D', '', 'g')
        = regexp_replace(v_fila.documento, '\D', '', 'g')
      and regexp_replace(v_fila.documento, '\D', '', 'g') <> ''
    limit 1;

    if v_emp is null then
      continue;
    end if;

    insert into public.persona_documentos
      (empleado_id, tipo, nombre, tema, horas, fecha_documento, notas, subido_por)
    select
      v_emp, 'capacitacion', v_tema, v_tema, v_horas, v_fecha, v_nota, new.creado_por
    where not exists (
      select 1 from public.persona_documentos pd
      where pd.empleado_id = v_emp
        and pd.tipo = 'capacitacion'
        and pd.notas = v_nota
    );
  end loop;

  return new;
end;
$fn$;

revoke all on function public.fn_sst_capacitacion_a_hojas_de_vida() from public, anon, authenticated;
