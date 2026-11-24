-- 0009_promesas_tabla_serie.sql
-- Qué hace: tabla de promesas por bucket de inicio (Vencidas, Vigentes, Promesado del mes) y serie diaria de
-- vigentes al cierre y promesas del día, para la sección Promesas de Resumen.
-- Reglas: services/promesas.py (fila de inicio: 0 (desmejora) / 0 (al día) / 1..6 / Legal / Sin referencia).
-- Orden: después de 0008. Quién la ejecuta: el administrador.

create or replace function public.cartera_promesas_tabla(
  p_fecha date,
  p_medida text default 'monto',           -- 'monto' (Monto promesado) o 'saldo' (Saldo del crédito)
  p_supervisor text[] default null,
  p_tipo_credito text[] default null,
  p_tipo_legal text[] default null
)
returns table (fila text, vencidas numeric, vigentes numeric, promesado_mes numeric)
language sql
stable
security invoker
set search_path = public
as $$
  with cu as (
    select distinct on (credito)
      credito, supervisor, tipo_credito, tipo_legal, tipo_cartera, bucket_inicial,
      (f_reporte = p_fecha) as en_corte,
      case when f_reporte = p_fecha then greatest(saldo, 0) else 0 end as saldo_corte,
      case when f_reporte = p_fecha and saldo > 0 then bucket_actual end as bucket_hoy
    from public.cobranza_diaria
    where f_reporte <= p_fecha
    order by credito, f_reporte desc
  ),
  cuf as (
    select * from cu
    where public.coincide(supervisor, p_supervisor)
      and public.coincide(tipo_credito, p_tipo_credito)
      and public.coincide(tipo_legal, p_tipo_legal)
  ),
  g as (select * from public.promesa where fecha_gestion::date <= p_fecha),
  ult as (select distinct on (credito) * from g order by credito, fecha_gestion desc, id desc),
  ult_mes as (select distinct on (credito) * from g where del_mes order by credito, fecha_gestion desc, id desc),
  estados as (
    select 'Vencidas' as estado, credito, sum(monto) as monto
      from g where del_mes and fecha_promesa < p_fecha group by credito
    union all
    select 'Vigentes', credito, sum(monto) from ult where fecha_promesa >= p_fecha group by credito
    union all
    select 'Promesado del mes', credito, sum(monto) from ult_mes group by credito
  ),
  filas as (
    select e.estado,
           case
             when c.tipo_cartera = 'Legal' then 'Legal'
             when c.bucket_inicial is null then 'Sin referencia'
             when c.bucket_inicial = 0 then case when c.bucket_hoy >= 1 then '0 (desmejora)' else '0 (al día)' end
             else c.bucket_inicial::text
           end as fila,
           case when p_medida = 'saldo' then c.saldo_corte else e.monto end as valor
    from estados e
    join cuf c on c.credito = e.credito
    where e.estado <> 'Vigentes' or c.en_corte
  )
  select fila,
         coalesce(sum(valor) filter (where estado = 'Vencidas'), 0),
         coalesce(sum(valor) filter (where estado = 'Vigentes'), 0),
         coalesce(sum(valor) filter (where estado = 'Promesado del mes'), 0)
  from filas
  group by fila;
$$;

create or replace function public.cartera_promesas_serie(
  p_fecha date,
  p_supervisor text[] default null,
  p_tipo_credito text[] default null,
  p_tipo_legal text[] default null
)
returns table (fecha date, vig_monto numeric, vig_saldo numeric, promesas_dia bigint)
language sql
stable
security invoker
set search_path = public
as $$
  with dias as (
    select distinct f_reporte as t from public.cobranza_diaria
    where f_reporte <= p_fecha and f_reporte < current_date
  )
  select d.t,
         v.vig_monto, v.vig_saldo, v.promesas_dia
  from dias d
  cross join lateral (
    with cu as (
      select distinct on (credito)
        credito, supervisor, tipo_credito, tipo_legal,
        (f_reporte = d.t) as en_corte,
        case when f_reporte = d.t then greatest(saldo, 0) else 0 end as saldo_corte
      from public.cobranza_diaria
      where f_reporte <= d.t
      order by credito, f_reporte desc
    ),
    cuf as (
      select * from cu
      where public.coincide(supervisor, p_supervisor)
        and public.coincide(tipo_credito, p_tipo_credito)
        and public.coincide(tipo_legal, p_tipo_legal)
    ),
    ult as (
      select distinct on (credito) * from public.promesa
      where fecha_gestion::date <= d.t
      order by credito, fecha_gestion desc, id desc
    )
    select
      coalesce(sum(u.monto) filter (where u.fecha_promesa >= d.t and c.en_corte), 0) as vig_monto,
      coalesce(sum(c.saldo_corte) filter (where u.fecha_promesa >= d.t and c.en_corte), 0) as vig_saldo,
      (select count(*) from public.promesa p join cuf c2 on c2.credito = p.credito
        where p.fecha_gestion::date = d.t) as promesas_dia
    from cuf c
    left join ult u on u.credito = c.credito
  ) v
  order by d.t;
$$;

grant execute on function public.cartera_promesas_tabla(date, text, text[], text[], text[]) to authenticated;
grant execute on function public.cartera_promesas_serie(date, text[], text[], text[]) to authenticated;
