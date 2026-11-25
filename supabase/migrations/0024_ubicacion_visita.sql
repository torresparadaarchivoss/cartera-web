-- 0024_ubicacion_visita.sql
-- Qué hace: coordenadas de cada visita de campo (latitud y longitud), para el mapa de visitas. Son datos de ubicación
-- del visitador y del domicilio visitado: acceso solo para administradores generales (RLS, perfiles.es_admin).
-- Solo se cargan coordenadas dentro del rango de El Salvador (services/visitas.con_coordenadas).
-- Orden: después de 0023. Quién la ejecuta: el administrador.

create table if not exists public.visita_ubicacion (
  id bigint generated always as identity,
  credito text not null,
  fecha_visita timestamp not null,
  visitador text not null default '',
  resultado text not null default '',
  latitud double precision not null,
  longitud double precision not null,
  constraint visita_ubicacion_pkey primary key (id)
);

create index if not exists visita_ubicacion_credito_idx on public.visita_ubicacion (credito, fecha_visita);

alter table public.visita_ubicacion enable row level security;

create policy visita_ubicacion_solo_admin on public.visita_ubicacion
  for select to authenticated
  using (public.es_super_admin());

grant select on public.visita_ubicacion to authenticated;
