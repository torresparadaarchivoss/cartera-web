-- 0017_recuperacion.sql
-- Qué hace: Recuperación (modules/recuperacion.py). Agrega a cada pago su bucket del día del pago y su bucket inicial
-- (la cartera del día del pago, réplica de enriquecer_pagos). Funciones: pagos y créditos por fila de bucket (con
-- fila Total), y monto pagado por día con acumulado del mes.
-- Regla: la cartera legal (tipo_cartera = 'Legal') va toda en la fila «Legal», en cualquier bucket.
-- Orden: después de 0016. Quién la ejecuta: el administrador. Después, correr la carga (scripts/cargar_cobranza.py).

alter table public.pago
  add column if not exists bucket_pago text not null default 'Sin mora',
  add column if not exists bucket_inicial text not null default 'Sin referencia';

drop function if exists public.recuperacion_por_bucket(date, text, text[], text[], text[]);

create or replace function public.recuperacion_por_bucket(
  p_fecha date,
  p_bucket text default 'bucket_pago',   -- 'bucket_pago' | 'bucket_inicial'
  p_supervisor text[] default null,
  p_tipo_credito text[] default null,
  p_tipo_legal text[] default null
)
returns table (
  fila text,
  creditos bigint,
  pagos bigint,
  pagado numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with base as (
    select
      credito,
      pago,
      case
        when tipo_cartera = 'Legal' then 'Legal'
        when p_bucket = 'bucket_inicial' then bucket_inicial
        else bucket_pago
      end as fila
    from public.pago
    where fecha <= p_fecha
      and public.coincide(supervisor, p_supervisor)
      and public.coincide(tipo_credito, p_tipo_credito)
      and public.coincide(tipo_legal, p_tipo_legal)
  ),
  por_fila as (
    select fila, count(distinct credito) as creditos, count(*) as pagos, sum(pago) as pagado
    from base
    group by fila
  )
  select fila, creditos, pagos, pagado from por_fila
  union all
  select 'Total', (select count(distinct credito) from base), (select count(*) from base),
         (select coalesce(sum(pago), 0) from base)
  where exists (select 1 from base);
$$;

drop function if exists public.recuperacion_pagos_dia(date, text[], text[], text[]);

create or replace function public.recuperacion_pagos_dia(
  p_fecha date,
  p_supervisor text[] default null,
  p_tipo_credito text[] default null,
  p_tipo_legal text[] default null
)
returns table (
  fecha date,
  pagado_dia numeric,
  pagado_acum numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with dia as (
    select p.fecha, sum(p.pago) as pagado_dia
    from public.pago p
    where p.fecha <= p_fecha
      and public.coincide(p.supervisor, p_supervisor)
      and public.coincide(p.tipo_credito, p_tipo_credito)
      and public.coincide(p.tipo_legal, p_tipo_legal)
    group by p.fecha
  )
  select d.fecha, d.pagado_dia,
         sum(d.pagado_dia) over (order by d.fecha rows between unbounded preceding and current row) as pagado_acum
  from dia d
  order by d.fecha;
$$;

grant execute on function public.recuperacion_por_bucket(date, text, text[], text[], text[]) to authenticated;
grant execute on function public.recuperacion_pagos_dia(date, text[], text[], text[]) to authenticated;
