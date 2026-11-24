-- 0003_cobranza_stock.sql
-- Qué hace: tabla de cobranza diaria (crédito × fecha de reporte) y funciones de stock para Resumen y Cartera.
-- Stock = cuentas activas (saldo > 0) en la fecha. Índice de mora 90+ = saldo con más de 90 días ÷ saldo.
-- Los filtros vacíos (arreglo nulo o vacío) incluyen todos los valores, igual que el Streamlit.
-- Orden: después de 0002. Quién la ejecuta: el administrador del proyecto.
-- La carga de filas la hace scripts/ desde la máquina del usuario (no desde la app).

create table if not exists public.cobranza_diaria (
  id bigint generated always as identity,
  credito text not null,
  f_reporte date not null,
  saldo numeric(14, 2) not null default 0,
  saldo_vencido numeric(14, 2),
  dias_mora integer,
  bucket_actual smallint,
  supervisor text not null default '',
  gestor text not null default '',
  tipo_credito text not null default '',
  tipo_legal text not null default '',
  tipo_cartera text not null default '',
  cargado_en timestamptz not null default now(),
  constraint cobranza_diaria_pkey primary key (id),
  constraint cobranza_diaria_credito_fecha_key unique (credito, f_reporte),
  constraint cobranza_diaria_bucket_check check (bucket_actual is null or bucket_actual between 0 and 6)
);

create index if not exists cobranza_diaria_fecha_idx on public.cobranza_diaria (f_reporte);

alter table public.cobranza_diaria enable row level security;

-- Cualquier usuario autenticado puede leer; solo la carga (con la clave del administrador) escribe.
create policy cobranza_diaria_lectura on public.cobranza_diaria
  for select to authenticated
  using (true);

-- Filtro «vacío = todos». Usado por todas las funciones de stock.
create or replace function public.coincide(valor text, lista text[])
returns boolean
language sql
immutable
as $$
  select lista is null or cardinality(lista) = 0 or valor = any(lista);
$$;

create or replace function public.cartera_fechas()
returns setof date
language sql
stable
security invoker
set search_path = public
as $$
  select distinct f_reporte from public.cobranza_diaria order by f_reporte;
$$;

create or replace function public.cartera_opciones()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'supervisor', coalesce((select jsonb_agg(v order by v) from (select distinct supervisor v from public.cobranza_diaria) s), '[]'::jsonb),
    'tipo_credito', coalesce((select jsonb_agg(v order by v) from (select distinct tipo_credito v from public.cobranza_diaria) s), '[]'::jsonb),
    'tipo_legal', coalesce((select jsonb_agg(v order by v) from (select distinct tipo_legal v from public.cobranza_diaria) s), '[]'::jsonb)
  );
$$;

-- Stock de una fecha de corte: saldo, cuentas, mora y índice 90+. Solo cuentas con saldo > 0.
create or replace function public.cartera_stock(
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
  with base as (
    select saldo, dias_mora
    from public.cobranza_diaria
    where f_reporte = p_fecha
      and saldo > 0
      and public.coincide(supervisor, p_supervisor)
      and public.coincide(tipo_credito, p_tipo_credito)
      and public.coincide(tipo_legal, p_tipo_legal)
  )
  select jsonb_build_object(
    'cuentas', count(*),
    'saldo', coalesce(sum(saldo), 0),
    'cuentas_mora', count(*) filter (where coalesce(dias_mora, 0) > 0),
    'saldo_mora_90', coalesce(sum(saldo) filter (where coalesce(dias_mora, 0) > 90), 0),
    'cuentas_mora_90', count(*) filter (where coalesce(dias_mora, 0) > 90),
    'indice_mora_90', case when sum(saldo) > 0
                           then sum(saldo) filter (where coalesce(dias_mora, 0) > 90) / sum(saldo)
                           else null end
  )
  from base;
$$;

-- Desglose por dimensión, con stock de la fecha de corte.
-- p_dimension: 'bucket' | 'supervisor' | 'tipo_credito' | 'tipo_cartera'.
create or replace function public.cartera_por_dimension(
  p_fecha date,
  p_dimension text,
  p_supervisor text[] default null,
  p_tipo_credito text[] default null,
  p_tipo_legal text[] default null
)
returns table (
  grupo text,
  cuentas bigint,
  saldo numeric,
  cuentas_mora bigint,
  saldo_mora_90 numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with base as (
    select
      case p_dimension
        when 'bucket' then coalesce(bucket_actual::text, 'Sin mora')
        when 'supervisor' then coalesce(nullif(supervisor, ''), '(sin dato)')
        when 'tipo_credito' then coalesce(nullif(tipo_credito, ''), '(sin dato)')
        when 'tipo_cartera' then coalesce(nullif(tipo_cartera, ''), '(sin dato)')
      end as grupo,
      saldo,
      dias_mora
    from public.cobranza_diaria
    where f_reporte = p_fecha
      and saldo > 0
      and public.coincide(supervisor, p_supervisor)
      and public.coincide(tipo_credito, p_tipo_credito)
      and public.coincide(tipo_legal, p_tipo_legal)
  )
  select grupo,
         count(*),
         coalesce(sum(saldo), 0),
         count(*) filter (where coalesce(dias_mora, 0) > 0),
         coalesce(sum(saldo) filter (where coalesce(dias_mora, 0) > 90), 0)
  from base
  group by grupo
  order by sum(saldo) desc;
$$;

-- Serie diaria del saldo por grupo (cartera activa de cada día, atributos del día).
create or replace function public.cartera_serie(
  p_dimension text,
  p_supervisor text[] default null,
  p_tipo_credito text[] default null,
  p_tipo_legal text[] default null
)
returns table (f_reporte date, grupo text, saldo numeric)
language sql
stable
security invoker
set search_path = public
as $$
  select f_reporte,
         case p_dimension
           when 'bucket' then coalesce(bucket_actual::text, 'Sin mora')
           when 'supervisor' then coalesce(nullif(supervisor, ''), '(sin dato)')
           when 'tipo_credito' then coalesce(nullif(tipo_credito, ''), '(sin dato)')
           when 'tipo_cartera' then coalesce(nullif(tipo_cartera, ''), '(sin dato)')
         end,
         sum(saldo)
  from public.cobranza_diaria
  where saldo > 0
    and public.coincide(supervisor, p_supervisor)
    and public.coincide(tipo_credito, p_tipo_credito)
    and public.coincide(tipo_legal, p_tipo_legal)
  group by 1, 2
  order by 1, 2;
$$;

grant select on public.cobranza_diaria to authenticated;
revoke execute on function public.cartera_fechas() from anon;
revoke execute on function public.cartera_opciones() from anon;
revoke execute on function public.cartera_stock(date, text[], text[], text[]) from anon;
revoke execute on function public.cartera_por_dimension(date, text, text[], text[], text[]) from anon;
revoke execute on function public.cartera_serie(text, text[], text[], text[]) from anon;
