# Carga de datos (se corre en tu máquina)

Lee la cartera diaria del mes desde MCCOLLECT (SQL Server) y la carga en la tabla `cobranza_diaria` de Supabase.
La app web no toca SQL Server: solo lee Supabase.

## Preparación (una vez)

    cd scripts
    python -m venv .venv
    .venv\Scripts\activate
    pip install -r requirements.txt

Requiere el driver **ODBC Driver 18 for SQL Server** instalado en Windows.

## Variables de entorno

Se definen en la sesión de PowerShell, nunca en archivos del repo:

- `MCCOLLECT_CONN`: cadena ODBC a MCCOLLECT. Es la misma que usa el Streamlit (`DWH_CONN`), o la armada con DRIVER, SERVER y DATABASE. Con usuario y contraseña de SQL Server van `UID` y `PWD` en lugar de `Trusted_Connection=yes`.
- `SUPABASE_DB_URL`: cadena de conexión Postgres del proyecto. Está en Supabase → Project Settings → Database → Connection string. Incluye la contraseña de la base; no la pegues en ningún archivo.

## Uso

    python cargar_cobranza.py --dry-run     # lee SQL Server y muestra el resumen; no escribe
    python cargar_cobranza.py               # carga el mes en curso y borra meses anteriores
    python cargar_cobranza.py --mes AAAA-MM

El resumen de `--dry-run` muestra las cuentas y el saldo de la última fecha para compararlos con el Streamlit.
Es idempotente: podés correrlo de nuevo cuando quieras actualizar.
