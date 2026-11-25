-- 0022_detalle_gestion.sql
-- Qué hace: detalle de gestiones y visitas del mes por crédito, para Cuentas a gestionar (tablas de gestiones y
-- visitas de cada cuenta). Sin datos personales del cliente (nombre, domicilio, etc.) ni coordenadas.
-- La carga reemplaza el mes completo (scripts/cargar_detalle.py).
-- Orden: después de 0021. Quién la ejecuta: el administrador.

create table if not exists public.gestion (
  id bigint generated always as identity,
  credito text not null,
  fecha_actividad timestamp not null,
  usuario text not null default '',
  accion text not null default '',
  resultado text not null default '',
  contacto smallint not null default 0,
  rpc smallint not null default 0,
  promesa smallint not null default 0,
  monto_promesa numeric(14, 2) not null default 0,
  fecha_promesa date,
  constraint gestion_pkey primary key (id)
);

create index if not exists gestion_credito_fecha_idx on public.gestion (credito, fecha_actividad);

create table if not exists public.visita (
  id bigint generated always as identity,
  credito text not null,
  fecha_visita timestamp not null,
  visitador text not null default '',
  accion text not null default '',
  resultado text not null default '',
  causa_no_pago text not null default '',
  parentesco text not null default '',
  num_fotos integer not null default 0,
  kilometros numeric(10, 2),
  constraint visita_pkey primary key (id)
);

create index if not exists visita_credito_fecha_idx on public.visita (credito, fecha_visita);

alter table public.gestion enable row level security;
alter table public.visita enable row level security;

create policy gestion_lectura on public.gestion for select to authenticated using (true);
create policy visita_lectura on public.visita for select to authenticated using (true);

grant select on public.gestion, public.visita to authenticated;
