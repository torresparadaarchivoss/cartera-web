-- 0031_gestion_prp.sql
-- Qué hace: marca PRP (con SGL) y promesa del catálogo (sin SGL) por gestión, como services/data_store del Streamlit.
-- Las usan las metas de agentes y visitadores. Orden: después de 0030. Quién la ejecuta: el administrador.
alter table public.gestion
  add column if not exists prp smallint not null default 0,
  add column if not exists promesa_catalogo smallint not null default 0;
