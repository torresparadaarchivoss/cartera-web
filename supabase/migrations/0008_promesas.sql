-- 0008_promesas.sql
-- Qué hace: tabla de promesas de pago (una fila por promesa registrada en el mes y en el mes anterior)
-- y la función de resumen por estado para la sección Promesas de Resumen gerencial.
-- Reglas (services/promesas.py):
--   Vencidas: promesas del mes con fecha de pago anterior al día de corte (todas, con repromesas).
--   Vigentes: última promesa de cada crédito con fecha de pago desde el corte, solo créditos en la foto del corte.
--   Promesado del mes: última promesa de cada crédito registrada en el mes (las repromesas no suman).
--   Del día: promesas registradas ese día.
-- Orden: después de 0007. Quién la ejecuta: el administrador.

create table if not exists public.promesa (
  id bigint generated always as identity,
  credito text not null,
  fecha_gestion timestamp not null,  -- con hora: define cuál es la última promesa de cada crédito
  fecha_promesa date,
  monto numeric(14, 2) not null default 0,
  del_mes boolean not null,
  cargado_en timestamptz not null default now(),
  constraint promesa_pkey primary key (id)
);

create index if not exists promesa_credito_idx on public.promesa (credito, fecha_gestion);

alter table public.promesa enable row level security;

create policy promesa_lectura on public.promesa
  for select to authenticated
  using (true);

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
  with cuentas as (
    -- Atributos y saldo: fila de la foto del corte o, si el crédito ya no está, su última fila anterior.
    select distinct on (credito)
      credito, supervisor, tipo_credito, tipo_legal,
      (f_reporte = p_fecha) as en_corte,
      case when f_reporte = p_fecha then greatest(saldo, 0) else 0 end as saldo_corte
    from public.cobranza_diaria
    where f_reporte <= p_fecha
    order by credito, f_reporte desc
  ),
  cuentas_f as (
    select * from cuentas
    where public.coincide(supervisor, p_supervisor)
      and public.coincide(tipo_credito, p_tipo_credito)
      and public.coincide(tipo_legal, p_tipo_legal)
  ),
  g as (
    select * from public.promesa where fecha_gestion::date <= p_fecha
  ),
  ult as (
    -- Última promesa de cada crédito (orden de registro).
    select distinct on (credito) * from g order by credito, fecha_gestion desc, id desc
  ),
  ult_mes as (
    select distinct on (credito) * from g where del_mes order by credito, fecha_gestion desc, id desc
  ),
  estados as (
    select 'Vencidas' as estado, credito, sum(monto) as monto, count(*) as n
      from g where del_mes and fecha_promesa < p_fecha group by credito
    union all
    select 'Vigentes', credito, sum(monto), count(*)
      from ult where fecha_promesa >= p_fecha group by credito
    union all
    select 'Promesado del mes', credito, sum(monto), count(*)
      from ult_mes group by credito
    union all
    select 'Del día', credito, sum(monto), count(*)
      from g where fecha_gestion::date = p_fecha group by credito
  ),
  filas as (
    select e.estado, e.credito, e.monto, e.n, c.saldo_corte
    from estados e
    join cuentas_f c on c.credito = e.credito
    where e.estado <> 'Vigentes' or c.en_corte
  ),
  nombres(estado, orden) as (
    values ('Vencidas', 1), ('Vigentes', 2), ('Promesado del mes', 3), ('Del día', 4)
  )
  select coalesce(jsonb_object_agg(n.estado, jsonb_build_object(
           'cuentas', coalesce(a.cuentas, 0),
           'monto', coalesce(a.monto, 0),
           'saldo', coalesce(a.saldo, 0),
           'promesas', coalesce(a.promesas, 0))
         ) , '{}'::jsonb)
  from nombres n
  left join (
    select estado, count(*) as cuentas, sum(monto) as monto, sum(saldo_corte) as saldo, sum(n) as promesas
    from filas group by estado
  ) a on a.estado = n.estado;
$$;

grant execute on function public.cartera_promesas(date, text[], text[], text[]) to authenticated;
