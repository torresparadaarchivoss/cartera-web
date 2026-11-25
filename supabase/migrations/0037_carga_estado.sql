-- 0037_carga_estado.sql
-- Qué hace: estado de la carga programada. Una fila por clave: ultima_carga_ok (último run que terminó bien) y
-- ultimo_intento (último run, bueno o malo). La app muestra la de ultima_carga_ok. Solo la carga escribe (con la clave
-- de la base). Orden: después de 0036. Quién la ejecuta: el administrador.
create table if not exists public.carga_estado (
  clave text primary key,
  ejecutado_en timestamptz not null,
  estado text not null,
  detalle text not null default ''
);

alter table public.carga_estado enable row level security;
create policy carga_estado_lectura on public.carga_estado for select to authenticated using (true);
grant select on public.carga_estado to authenticated;
