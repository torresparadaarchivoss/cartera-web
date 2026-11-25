-- 0033_visita_km_precision.sql
-- Qué hace: los kilómetros de cada visita se guardaban con 2 decimales, y al sumar se perdían centésimas por visita. Se
-- guardan con 3 decimales, como en el Streamlit. Orden: después de 0032. Quién la ejecuta: el administrador.
alter table public.visita alter column kilometros type numeric(12, 3);
