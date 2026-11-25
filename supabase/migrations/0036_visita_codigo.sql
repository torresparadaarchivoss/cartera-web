-- 0036_visita_codigo.sql
-- Qué hace: código de resultado de la visita (HIST_VI_CODRESULTADO), para el código de visita de Comisiones de campo.
-- Los comentarios libres no se cargan (decisión de privacidad de cargar_detalle.py). Orden: después de 0035.
alter table public.visita add column if not exists cod_resultado text not null default '';
