-- Rollback de la migración 86 (reuniones). Se NIEGA si ya hay reuniones: borrarlas perdería las
-- transcripciones, las actas y el registro del aviso de grabación. En ese caso se decide antes.
-- Los audios del bucket "reuniones" no se tocan (se borran por la API de Storage, a conciencia).
do $$
begin
  if exists (select 1 from public.reuniones) then
    raise exception 'Hay reuniones registradas: el rollback de la 86 no se corre sin decidir qué pasa con ellas.';
  end if;
end $$;

drop policy if exists reuniones_audio_insert on storage.objects;
drop policy if exists reuniones_audio_select on storage.objects;
drop function if exists public.fn_reunion_audio_subible(text);
drop table if exists public.reunion_tareas;
drop table if exists public.reuniones;
drop function if exists public.fn_reunion_tareas_reglas();
drop function if exists public.fn_reuniones_reglas();
-- La plantilla "Acta de reunión" se quita solo si nadie la llenó.
delete from public.sst_plantillas p
where p.id = '00000000-0000-4000-8000-0000000086a1'
  and not exists (select 1 from public.sst_formatos f where f.plantilla_id = p.id);
