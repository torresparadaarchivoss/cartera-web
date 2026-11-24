-- 0013_monto_pagado.sql
-- Qué hace: monto pagado real (CHIRICO) por día y acumulado del mes en cobranza_diaria; tabla de pagos con sus
-- atributos del día del pago; funciones de monto pagado para Cartera (columna) y Promesas (tarjeta).
-- Orden: después de 0012. Quién la ejecuta: el administrador. Después, correr la carga.

alter table public.cobranza_diaria
  add column if not exists monto_pagado_dia numeric(14, 2) not null default 0,
  add column if not exists monto_pagado_acum numeric(14, 2) not null default 0;

create table if not exists public.pago (
  id bigint generated always as identity,
  credito text not null,
  fecha date not null,
  pago numeric(14, 2) not null default 0,
  supervisor text not null default '',
  tipo_credito text not null default '',
  tipo_legal text not null default '',
  tipo_cartera text not null default '',
  cargado_en timestamptz not null default now(),
  constraint pago_pkey primary key (id)
);

create index if not exists pago_fecha_idx on public.pago (fecha);

alter table public.pago enable row level security;

create policy pago_lectura on public.pago
  for select to authenticated
  using (true);

grant select on public.pago to authenticated;

-- Flujo por grupo: ahora con monto pagado (suma del acumulado del mes de cada cuenta del mes).
drop function if exists public.cartera_flujo_por_dimension(date, text, text[], text[], text[]);

create or replace function public.cartera_flujo_por_dimension(
  p_fecha date,
  p_dimension text,
  p_supervisor text[] default null,
  p_tipo_credito text[] default null,
  p_tipo_legal text[] default null
)
returns table (
  grupo text,
  cuentas bigint,
  gestionadas bigint,
  rpc bigint,
  monto_prometido numeric,
  monto_pagado numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with base as (
    select * from public.cobranza_diaria where f_reporte <= p_fecha
  ),
  con_saldo as (select distinct credito from base where saldo > 0),
  activas_hoy as (select credito from base where f_reporte = p_fecha and saldo > 0),
  canceladas as (
    select distinct on (credito) *
    from base
    where credito in (select credito from con_saldo)
      and credito not in (select credito from activas_hoy)
    order by credito, f_reporte desc
  ),
  mes as (
    select * from base
    where f_reporte = p_fecha and saldo > 0
      and public.coincide(supervisor, p_supervisor)
      and public.coincide(tipo_credito, p_tipo_credito)
      and public.coincide(tipo_legal, p_tipo_legal)
    union all
    select * from canceladas
    where public.coincide(supervisor, p_supervisor)
      and public.coincide(tipo_credito, p_tipo_credito)
      and public.coincide(tipo_legal, p_tipo_legal)
  ),
  con_grupo as (
    select
      case p_dimension
        when 'bucket' then case when tipo_cartera = 'Legal' then 'Legal'
                                else coalesce(bucket_actual::text, 'Sin mora') end
        when 'supervisor' then coalesce(nullif(supervisor, ''), '(sin dato)')
        when 'tipo_credito' then coalesce(nullif(tipo_credito, ''), '(sin dato)')
        when 'tipo_cartera' then coalesce(nullif(tipo_cartera, ''), '(sin dato)')
      end as grupo,
      gestiones_acum, rpc_acum, monto_promesa_acum, monto_pagado_acum
    from mes
  )
  select grupo,
         count(*),
         count(*) filter (where gestiones_acum > 0),
         count(*) filter (where rpc_acum > 0),
         coalesce(sum(monto_promesa_acum), 0),
         coalesce(sum(monto_pagado_acum), 0)
  from con_grupo
  group by grupo
  order by sum(monto_promesa_acum) desc;
$$;

create or replace function public.cartera_pagado_periodo(
  p_fecha date,
  p_supervisor text[] default null,
  p_tipo_credito text[] default null,
  p_tipo_legal text[] default null
)
returns numeric
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(sum(pago), 0)
  from public.pago
  where fecha <= p_fecha
    and public.coincide(supervisor, p_supervisor)
    and public.coincide(tipo_credito, p_tipo_credito)
    and public.coincide(tipo_legal, p_tipo_legal);
$$;

grant execute on function public.cartera_flujo_por_dimension(date, text, text[], text[], text[]) to authenticated;
grant execute on function public.cartera_pagado_periodo(date, text[], text[], text[]) to authenticated;
