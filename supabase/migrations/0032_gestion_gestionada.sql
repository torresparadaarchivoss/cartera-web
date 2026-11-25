-- 0032_gestion_gestionada.sql
-- Qué hace: marca «gestionada» por gestión (catálogo del DWH, como el Streamlit). Cuenta los créditos gestionados de
-- agentes y de Gestión de cobros. Orden: después de 0031. Quién la ejecuta: el administrador.
alter table public.gestion add column if not exists gestionada smallint not null default 0;
