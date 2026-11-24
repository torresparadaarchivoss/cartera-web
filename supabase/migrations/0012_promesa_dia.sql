-- 0012_promesa_dia.sql
-- Qué hace: guarda el estado de promesas de cada día y crédito (calculado en la carga, igual que services/promesas.py)
-- y reemplaza las funciones de promesas para que lean esa tabla. Así las consultas ya no recorren la cartera
-- por fecha y no superan el tiempo máximo de Supabase.
-- Orden: después de 0011. La carga (cargar_cobranza.py) llena esta tabla. Quién la ejecuta: el administrador.

create table if not exists public.promesa_dia (
  id bigint generated always as identity,
  f_reporte date not null,
  credito text not null,
  estado text not null,            -- Vencidas | Vigentes | Promesado del mes | Del día
  monto numeric(14, 2) not null default 0,
  n_promesas integer not null default 0,
  saldo_corte numeric(14, 2) not null default 0,
  supervisor text not null default '',
  tipo_credito text not null default '',
  tipo_legal text not null default '',
  tipo_cartera text not null default '',
  fila text not null,              -- bucket de inicio: 0 (desmejora) | 0 (al día) | 1..6 | Legal | Sin referencia
  constraint promesa_dia_pkey primary key (id),
  constraint promesa_dia_estado_check check (estado in ('Vencidas', 'Vigentes', 'Promesado del mes', 'Del día'))
);

create index if not exists promesa_dia_fecha_idx on public.promesa_dia (f_reporte);

alter table public.promesa_dia enable row level security;

create policy promesa_dia_lectura on public.promesa_dia
  for select to authenticated
  using (true);

grant select on public.promesa_dia to authenticated;

create or replace function public.cartera_promesas(
  p_fecha date,
  p_supervisor text[] default null,
  p_tipo_credito text[] default null,
  p_tipo_legal text[] default null
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with f as (
    select * from public.promesa_dia
    where f_reporte = p_fecha
      and public.coincide(supervisor, p_supervisor)
      and public.coincide(tipo_credito, p_tipo_credito)
      and public.coincide(tipo_legal, p_tipo_legal)
  ),
  agg as (
    select estado, count(*) as cuentas, sum(monto) as monto, sum(saldo_corte) as saldo, sum(n_promesas) as promesas
    from f group by estado
  ),
  nombres(estado) as (values ('Vencidas'), ('Vigentes'), ('Promesado del mes'), ('Del día'))
  select coalesce(jsonb_object_agg(n.estado, jsonb_build_object(
           'cuentas', coalesce(a.cuentas, 0),
           'monto', coalesce(a.monto, 0),
           'saldo', coalesce(a.saldo, 0),
           'promesas', coalesce(a.promesas, 0))), '{}'::jsonb)
  from nombres n
  left join agg a on a.estado = n.estado;
$$;

create or replace function public.cartera_promesas_tabla(
  p_fecha date,
  p_medida text default 'monto',
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
  select fila,
         coalesce(sum(case when p_medida = 'saldo' then saldo_corte else monto end) filter (where estado = 'Vencidas'), 0),
         coalesce(sum(case when p_medida = 'saldo' then saldo_corte else monto end) filter (where estado = 'Vigentes'), 0),
         coalesce(sum(case when p_medida = 'saldo' then saldo_corte else monto end) filter (where estado = 'Promesado del mes'), 0)
  from public.promesa_dia
  where f_reporte = p_fecha
    and public.coincide(supervisor, p_supervisor)
    and public.coincide(tipo_credito, p_tipo_credito)
    and public.coincide(tipo_legal, p_tipo_legal)
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
  select f_reporte,
         coalesce(sum(monto) filter (where estado = 'Vigentes'), 0),
         coalesce(sum(saldo_corte) filter (where estado = 'Vigentes'), 0),
         coalesce(sum(n_promesas) filter (where estado = 'Del día'), 0)
  from public.promesa_dia
  where f_reporte <= p_fecha
    and f_reporte < current_date
    and public.coincide(supervisor, p_supervisor)
    and public.coincide(tipo_credito, p_tipo_credito)
    and public.coincide(tipo_legal, p_tipo_legal)
  group by f_reporte
  order by f_reporte;
$$;

grant execute on function public.cartera_promesas(date, text[], text[], text[]) to authenticated;
grant execute on function public.cartera_promesas_tabla(date, text, text[], text[], text[]) to authenticated;
grant execute on function public.cartera_promesas_serie(date, text[], text[], text[]) to authenticated;
