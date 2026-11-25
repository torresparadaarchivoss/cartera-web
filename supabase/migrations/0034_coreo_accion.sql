-- 0034_coreo_accion.sql
-- Qué hace: acción de hoy por episodio (Urgente, Visitar hoy, Llamar hoy, Sin acción hoy), calculada por
-- services/coreografias.py. Orden: después de 0033. Quién la ejecuta: el administrador.
alter table public.coreo_episodio add column if not exists accion text;
