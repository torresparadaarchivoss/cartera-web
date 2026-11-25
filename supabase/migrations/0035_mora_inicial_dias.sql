-- 0035_mora_inicial_dias.sql
-- Qué hace: días de mora del cierre anterior (loantape diasmora) por crédito, para la referencia de la ficha de crédito.
-- Orden: después de 0034. Quién la ejecuta: el administrador.
alter table public.cobranza_diaria add column if not exists dias_mora_inicial integer;
