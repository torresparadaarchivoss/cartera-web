-- 0019_roll_rates.sql
-- Qué hace: Roll rates (services/cohort_engine.py). Grilla de la cohorte congelada del primer día: por bucket inicial
-- (origen) y bucket en la fecha de seguimiento (destino), con cuentas, saldo base y saldo observado.
-- Regla: población = créditos con saldo > 0 el primer día (congelada); origen = bucket del cierre de loantape
-- (sin referencia = 'Sin referencia'); destino = bucket en la fecha, 'Sin registro' si no está en la cartera o no
-- tiene mora. Filtros sobre los atributos del primer día. Orden: después de 0018. Quién la ejecuta: el administrador.

create or replace function public.roll_rates_grilla(
  p_fecha date,
  p_supervisor text[] default null,
  p_tipo_credito text[] default null,
  p_tipo_legal text[] default null
)
returns table (
  origen text,
  destino text,
  creditos bigint,
  saldo_base numeric,
  saldo_obs numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with f0 as (
    select min(f_reporte) as f from public.cobranza_diaria
  ),
  coh as (
    select c.credito, c.saldo as saldo_base,
           coalesce(c.bucket_inicial::text, 'Sin referencia') as origen
    from public.cobranza_diaria c
    cross join f0
    where c.f_reporte = f0.f
      and c.saldo > 0
      and public.coincide(c.supervisor, p_supervisor)
      and public.coincide(c.tipo_credito, p_tipo_credito)
      and public.coincide(c.tipo_legal, p_tipo_legal)
  ),
  obs as (
    select credito, bucket_actual, saldo from public.cobranza_diaria where f_reporte = p_fecha
  ),
  seg as (
    select coh.origen, coh.saldo_base, coalesce(o.saldo, 0) as saldo_obs,
           case when o.credito is null or o.bucket_actual is null then 'Sin registro'
                else o.bucket_actual::text end as destino
    from coh
    left join obs o on o.credito = coh.credito
  )
  select origen, destino, count(*), sum(saldo_base), sum(saldo_obs)
  from seg
  group by origen, destino;
$$;

grant execute on function public.roll_rates_grilla(date, text[], text[], text[]) to authenticated;
