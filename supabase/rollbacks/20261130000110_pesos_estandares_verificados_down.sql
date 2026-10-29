-- Deshace 20261130000110: los 18 pesos vuelven a "sin verificar" (el total se muestra provisional).
update public.sst_plan_items set valor_verificado = false
 where anio = 2026
   and codigo in ('2.1.1', '2.2.1', '2.3.1', '2.4.1', '2.5.1', '2.6.1', '2.7.1', '2.8.1', '2.9.1', '2.10.1', '2.11.1',
                  '3.2.1', '3.2.2', '3.2.3', '4.1.1', '4.1.2', '4.1.3', '4.1.4');
