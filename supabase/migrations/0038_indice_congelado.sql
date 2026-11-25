-- 0038_indice_congelado.sql
-- Qué hace: índice parcial para la cohorte congelada (primer día con saldo por crédito), que usan las funciones de
-- rodamiento y cuentas a gestionar. Evita recorrer toda cobranza_diaria en cada consulta. Orden: después de 0037.
create index if not exists cobranza_diaria_congelado_idx
  on public.cobranza_diaria (credito, f_reporte)
  where coalesce(saldo, 0) > 0;
analyze public.cobranza_diaria;
