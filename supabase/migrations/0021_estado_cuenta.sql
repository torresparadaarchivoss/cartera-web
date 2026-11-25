-- 0021_estado_cuenta.sql
-- Qué hace: campos de estado de cobranza por crédito y día, para Cuentas a gestionar (services/calculations.py):
-- estado de cobranza acumulado del mes, prioridad acumulada, rango de intentos y marca de Cuenta Top (services/cuentas_top).
-- Orden: después de 0020. Quién la ejecuta: el administrador. Después, correr la carga (scripts/cargar_cobranza.py).

alter table public.cobranza_diaria
  add column if not exists top boolean not null default false,
  add column if not exists estado_cobranza_acum text not null default '',
  add column if not exists prioridad_acumulada text not null default '',
  add column if not exists rango_intentos_acumulado text not null default '';
