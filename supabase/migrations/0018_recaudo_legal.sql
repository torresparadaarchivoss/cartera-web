-- 0018_recaudo_legal.sql
-- Qué hace: Recaudo legal (services/recaudo_legal.py). Agrega el canal de CHIRICO a cada pago (para detectar pagos
-- por embargo) y dos funciones: base de créditos legales del primer día con su agente, recaudo y comprobante;
-- y promesas vigentes por crédito (última promesa, si su fecha de pago es desde la fecha de corte).
-- Regla: universo = créditos JUR con saldo > 0 el primer día del mes; agente = último gestor válido hasta la fecha.
-- Orden: después de 0017. Quién la ejecuta: el administrador. Después, correr la carga (scripts/cargar_cobranza.py).

alter table public.pago
  add column if not exists canal text not null default '';

drop function if exists public.recaudo_legal_base(date);

create or replace function public.recaudo_legal_base(p_fecha date)
returns table (
  credito text,
  saldo numeric,
  gestor text,        -- '' = sin asignar
  recaudo numeric,
  con_pago boolean,
  embargo boolean     -- hubo un pago por el canal legal de CHIRICO
)
language sql
stable
security invoker
set search_path = public
as $$
  with f0 as (
    select min(f_reporte) as f from public.cobranza_diaria
  ),
  universo as (
    select c.credito, c.saldo
    from public.cobranza_diaria c, f0
    where c.f_reporte = f0.f
      and upper(trim(c.tipo_legal)) = 'JUR'
      and coalesce(c.saldo, 0) > 0
  ),
  gest as (
    select distinct on (c.credito) c.credito, lower(trim(c.gestor)) as gestor
    from public.cobranza_diaria c
    join universo u on u.credito = c.credito
    where c.f_reporte <= p_fecha
      and lower(trim(coalesce(c.gestor, ''))) not in ('', 'sin asignar')
    order by c.credito, c.f_reporte desc
  ),
  pg as (
    select p.credito,
           sum(p.pago) as recaudo,
           count(*) > 0 as con_pago,
           bool_or(lower(trim(p.canal)) = 'legal') as embargo
    from public.pago p
    join universo u on u.credito = p.credito
    where p.fecha <= p_fecha
    group by p.credito
  )
  select u.credito,
         u.saldo,
         coalesce(g.gestor, '') as gestor,
         coalesce(pg.recaudo, 0) as recaudo,
         coalesce(pg.con_pago, false) as con_pago,
         coalesce(pg.embargo, false) as embargo
  from universo u
  left join gest g on g.credito = u.credito
  left join pg on pg.credito = u.credito;
$$;

drop function if exists public.recaudo_legal_vigentes(date);

create or replace function public.recaudo_legal_vigentes(p_fecha date)
returns table (
  credito text,
  monto numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with corte as (
    select max(f_reporte) as f from public.cobranza_diaria where f_reporte <= p_fecha
  ),
  ult as (
    select distinct on (pr.credito) pr.credito, pr.monto, pr.fecha_promesa
    from public.promesa pr
    where pr.fecha_gestion < p_fecha + 1
    order by pr.credito, pr.fecha_gestion desc
  )
  select u.credito, u.monto
  from ult u, corte c
  where u.fecha_promesa >= p_fecha
    and exists (
      select 1 from public.cobranza_diaria d
      where d.credito = u.credito and d.f_reporte = c.f
    );
$$;

grant execute on function public.recaudo_legal_base(date) to authenticated;
grant execute on function public.recaudo_legal_vigentes(date) to authenticated;
