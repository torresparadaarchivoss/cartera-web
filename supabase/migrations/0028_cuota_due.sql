-- 0028_cuota_due.sql
-- Qué hace: agrega a cobranza_diaria la cuota del crédito (PR_CL_VAL_CUOTA) y el due de inicio de mes
-- (PR_CL_DUE_IM), que usa Comisiones de campo para el «paga cuota» y la comisión por mora.
-- Orden: después de 0027. Quién la ejecuta: el administrador. La carga de cargar_cobranza.py la llena.

alter table public.cobranza_diaria
  add column if not exists valor_cuota numeric(14, 2),
  add column if not exists due_inicio_mes numeric(14, 2);
