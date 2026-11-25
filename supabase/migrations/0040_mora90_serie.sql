-- Serie diaria del índice de mora 90+ del mes (saldo con más de 90 días de mora ÷ saldo), con la misma definición que
-- cartera_stock. Se usa en la gráfica de evolución del Resumen gerencial.

create or replace function public.cartera_mora90_serie(
  p_fecha date,
  p_desde date,
  p_supervisor text[] default null,
  p_tipo_credito text[] default null,
  p_tipo_legal text[] default null
)
returns table (f_reporte date, saldo numeric, saldo_mora_90 numeric, indice_mora_90 numeric)
language sql
stable
security invoker
set search_path = public
as $$
  select f_reporte,
         coalesce(sum(saldo), 0),
         coalesce(sum(saldo) filter (where coalesce(dias_mora, 0) > 90), 0),
         case when sum(saldo) > 0
              then sum(saldo) filter (where coalesce(dias_mora, 0) > 90) / sum(saldo)
         end
  from public.cobranza_diaria
  where f_reporte between p_desde and p_fecha
    and saldo > 0
    and public.coincide(supervisor, p_supervisor)
    and public.coincide(tipo_credito, p_tipo_credito)
    and public.coincide(tipo_legal, p_tipo_legal)
  group by f_reporte
  order by f_reporte;
$$;

grant execute on function public.cartera_mora90_serie(date, date, text[], text[], text[]) to authenticated;
