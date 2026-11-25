-- Promesas por bucket (la versión con filtros de sección que usa la web): además de la medida elegida, devuelve el saldo
-- de las promesas activas (vigentes) y el saldo de la cartera de cada fila. Con eso la tabla muestra
-- "% de cartera de las vigentes (en saldo)" sin depender de la medida. Cambia el tipo de retorno: se borra y se crea.

drop function if exists public.cartera_promesas_tabla(date, text, text[], text[], text[], text[], text[], text);
drop function if exists public.cartera_promesas_tabla(date, text, text[], text[], text[]);

create or replace function public.cartera_promesas_tabla(
  p_fecha date,
  p_medida text default 'monto',
  p_supervisor text[] default null,
  p_tipo_credito text[] default null,
  p_tipo_legal text[] default null,
  p_sec_supervisor text[] default null,
  p_sec_gestor text[] default null,
  p_top text default 'Todas'
)
returns table (fila text, vencidas numeric, vigentes numeric, promesado_mes numeric, vigentes_saldo numeric, cartera_saldo numeric)
language sql
stable
security invoker
set search_path = public
as $$
  with pd as (
    select * from public.promesa_dia
    where f_reporte = p_fecha
      and public.coincide(supervisor, p_supervisor)
      and public.coincide(tipo_credito, p_tipo_credito)
      and public.coincide(tipo_legal, p_tipo_legal)
      and public.coincide(supervisor, p_sec_supervisor)
      and public.coincide(gestor, p_sec_gestor)
      and public.cartera_top_ok(p_top, top)
  ),
  agg as (
    select fila,
           coalesce(sum(case when p_medida = 'saldo' then saldo_corte else monto end) filter (where estado = 'Vencidas'), 0) as vencidas,
           coalesce(sum(case when p_medida = 'saldo' then saldo_corte else monto end) filter (where estado = 'Vigentes'), 0) as vigentes,
           coalesce(sum(case when p_medida = 'saldo' then saldo_corte else monto end) filter (where estado = 'Promesado del mes'), 0) as promesado_mes,
           coalesce(sum(saldo_corte) filter (where estado = 'Vigentes'), 0) as vigentes_saldo
    from pd
    group by fila
  ),
  cartera as (
    select case
             when tipo_cartera = 'Legal' then 'Legal'
             when bucket_inicial is null then 'Sin referencia'
             when bucket_inicial = 0 then case when bucket_actual >= 1 then '0 (desmejora)' else '0 (al día)' end
             else bucket_inicial::text
           end as fila,
           sum(greatest(saldo, 0)) as saldo
    from public.cobranza_diaria
    where f_reporte = p_fecha and saldo > 0
      and public.coincide(supervisor, p_supervisor)
      and public.coincide(tipo_credito, p_tipo_credito)
      and public.coincide(tipo_legal, p_tipo_legal)
      and public.coincide(supervisor, p_sec_supervisor)
      and public.coincide(gestor, p_sec_gestor)
      and public.cartera_top_ok(p_top, top)
    group by 1
  ),
  r as (
    select fila from agg
    union
    select fila from cartera
  )
  select r.fila,
         coalesce(a.vencidas, 0),
         coalesce(a.vigentes, 0),
         coalesce(a.promesado_mes, 0),
         coalesce(a.vigentes_saldo, 0),
         coalesce(k.saldo, 0)
  from r
  left join agg a using (fila)
  left join cartera k using (fila);
$$;

grant execute on function public.cartera_promesas_tabla(date, text, text[], text[], text[], text[], text[], text) to authenticated;
