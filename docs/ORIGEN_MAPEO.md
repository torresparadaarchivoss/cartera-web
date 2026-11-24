# Mapeo del origen → web

Inventario del tablero Streamlit (`C:\Users\jctorresp\Videos\dashboard_cartera`), solo lectura. Estado: **pendiente** = aún no portado; **listo** = replicado y verificado.

| Página del origen | Módulo origen | Archivo web | Estado |
|---|---|---|---|
| Resumen gerencial | modules/resumen.py | app/src/pages/Resumen.tsx | pendiente (placeholder) |
| Cartera | modules/cartera.py | — | pendiente |
| Roll rates | modules/roll_rates.py | — | pendiente |
| Rodamiento real | modules/rodamiento_real.py | — | pendiente |
| Gestión de cobros | modules/gestiones.py | — | pendiente |
| Coreografías de gestión | modules/coreografias.py | — | pendiente |
| Recuperación | modules/recuperacion.py | — | pendiente |
| Visitas de campo | modules/visitas.py | — | pendiente |
| Comisiones de campo | modules/comisiones.py | — | pendiente |
| Cuentas a gestionar | modules/cuentas.py | — | pendiente |
| Ficha de crédito | modules/ficha_credito.py | — | pendiente |
| Metas y cumplimiento | modules/metas.py, metas_bucket.py | — | pendiente |
| Administración | modules/admin.py | app/src/App.tsx (ruta /parametros, placeholder) | pendiente |
| Evolución de mora | modules/evolucion_mora.py | — | pendiente |

## Lógica de negocio a portar (desde services/)

Calendario y cálculos: `calculations.py`, `indicadores.py`, `comisiones.py`, `coreografias.py`, `cohort_engine.py`, `targets_engine.py`, `rodamiento_real.py`, `promesas.py`, `cuentas_top.py`, `recaudo_legal.py`, `detalle.py`, `gestion.py`, `visitas.py`, `loantape.py`, `nombres.py`, `codigos.py`, `user_catalog.py`. Según el prompt, la lógica pesada va a SQL o funciones de base; el frontend solo presenta.

## Configuración a portar a la base

`config.py` define: buckets de mora (0, 30, 60, 90, 120, 150), códigos PRP, usuarios excluidos de gestión, fracción de día laborable (0.3), fracción de cuentas Top (0.6), pesos por día (lun–dom: 1,1,1,1,1,0.5,0), umbrales de semáforo (verde 1.0, amarillo 0.8). Cada uno va a `parametro_pais` o a una tabla de catálogo, no a constantes del navegador.

## Pendiente de decisión

- Saldo vencido: quitado de visuales del origen y de la web. Se mantiene solo en cálculos internos (comisiones y coreografías). Falta decidir si se quita de todos los cálculos.
- Power BI y las salidas de Excel/HTML del origen no se replican en esta primera versión.
