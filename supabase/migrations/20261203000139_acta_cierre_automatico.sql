-- Cierre automático del acta cuando entra la última firma obligatoria.
--
-- Pedido de Jhojan (2026-11-04): firmó y no encontró cómo cerrar sin la firma del
-- cliente. Y es correcto que no pueda: un acta de inicio sin la firma del contratante
-- no es un acta. Lo que faltaba era que se cerrara sola al completarse.
--
-- Los dos caminos que pidió quedan cubiertos por el mismo mecanismo:
--   1) EN SITIO: firman los dos seguido en el mismo dispositivo. Al entrar la segunda
--      firma el acta se sella sola y se publica para ambos.
--   2) A DISTANCIA: él firma, envía al cliente, el cliente firma desde su portal.
--      Al entrar esa firma el acta se sella sola y se publica. Nadie busca un botón.
--
-- Acotado a propósito: solo actúa en plantillas marcadas con control->>'cierre_automatico'.
-- Un FOR-02 o un ATS, donde las firmas entran a lo largo del día, NO se cierran solos.

create or replace function public.fn_sst_sellar_si_completo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estado text;
  v_auto   boolean;
  v_falta  text;
begin
  select f.estado,
         coalesce((pl.control ->> 'cierre_automatico')::boolean, false)
    into v_estado, v_auto
  from public.sst_formatos f
  join public.sst_plantillas pl on pl.id = f.plantilla_id
  where f.id = new.formato_id;

  if not coalesce(v_auto, false) or v_estado is distinct from 'borrador' then
    return new;
  end if;

  select string_agg(x ->> 'etiqueta', ', ') into v_falta
  from public.sst_formatos f
  join public.sst_plantillas pl on pl.id = f.plantilla_id,
       jsonb_array_elements(pl.firmas) x
  where f.id = new.formato_id
    and coalesce((x ->> 'obligatoria')::boolean, true)
    and not exists (
      select 1 from public.sst_formato_firmas s
      where s.formato_id = new.formato_id and s.rol = x ->> 'rol'
    );

  if v_falta is not null then
    return new;  -- todavía falta alguien: se queda en borrador
  end if;

  update public.sst_formatos
     set estado = 'firmado',
         sellado_en = now(),
         hash_contenido = public.fn_sst_hash_formato(new.formato_id)
   where id = new.formato_id and estado = 'borrador';

  return new;
end;
$$;

revoke all on function public.fn_sst_sellar_si_completo() from public, anon, authenticated;

drop trigger if exists sst_firmas_sellar_si_completo on public.sst_formato_firmas;
create trigger sst_firmas_sellar_si_completo
  after insert on public.sst_formato_firmas
  for each row execute function public.fn_sst_sellar_si_completo();

update public.sst_plantillas
   set control = coalesce(control, '{}'::jsonb) || '{"cierre_automatico": true}'::jsonb
 where codigo = 'PRY-ACTA-INICIO' and estado = 'publicada';

-- Verificado contra producción con el acta de Tintalá (y revertido entero):
--   EN SITIO     firma solo Servielectro -> borrador
--                firma el cliente al lado -> firmado · publicada 1 documento
--   A DISTANCIA  Jhojan firma y envía -> borrador
--                el cliente firma desde su portal -> firmado · publicada 1 documento
