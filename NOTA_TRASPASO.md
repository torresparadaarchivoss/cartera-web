# Traspaso: versión web del dashboard de cartera (Streamlit → GitHub Pages)

Esta carpeta es la raíz del proyecto web. Se trabaja en una sesión nueva de Claude Code abierta aquí.

## Qué se replica
- El **Streamlit** (`C:\Users\jctorresp\Videos\dashboard_cartera`), no el HTML exportado.
- El HTML exportado solo sirvió como referencia de cifras. Cuenta activa del 24/11: 5.334 cuentas, saldo $10.880.966,42 (coincide con el Streamlit).
- El saldo vencido **no se usa** en el Streamlit: no debe entrar en la versión web.

## Decisiones ya tomadas
- Publicar datos en GitHub Pages: autorizado por el usuario.
- Incluir número de crédito y comentarios, para que funcionen los exportadores Excel y CSV: pendiente de confirmar.

## Prompt base
`PROMPT_migracion_streamlit_a_web.md` (copiado desde el proyecto de origen). Sus parámetros de la sección 1 siguen pendientes: ver abajo.

## Parámetros pendientes de definir con el usuario
- `NOMBRE_REPO` (nombre del repositorio en GitHub, minúsculas con guiones).
- `TITULO_APP` (título de la pestaña).
- `PAISES` (si aplica).
- `VENTANA_MESES` (por defecto 3).
- `SUPER_ADMIN` (solo marcador en el seed versionado).

## Reglas de trabajo
- El proyecto de origen es de solo lectura.
- Sin secretos, claves ni `.env` en el repositorio.
- No hacer push sin autorización explícita.

## Respuestas del usuario (2026-11-24)
- `NOMBRE_REPO`: `cartera-web`
- `TITULO_APP`: `Cartera y Cobros`
- `PAISES`: solo El Salvador
- `VENTANA_MESES`: 1 (solo el mes en curso)
- Número de crédito y comentarios: sí, para los exportadores Excel y CSV (autorizado por el usuario).
- Publicar datos en GitHub Pages: autorizado.

## Pendiente de confirmar
- Saldo vencido: el usuario pidió quitarlo. Hoy también lo usan: ficha de crédito (serie de saldo vencido), comisiones (vencido de inicio de mes), indicadores de cartera (saldo vencido) y la exportación HTML. Solo coreografías lo usa para «al día antes del cierre». Falta decidir si se quita de todo el proyecto o solo de coreografías.

## Lo que hace el usuario (no el agente)
1. Crear el proyecto en Supabase y entregar el `project ref`.
2. Pegar la `anon key` en `app/.env.production` (el agente no la lee ni la escribe).
3. Ejecutar las migraciones en el SQL Editor, en orden (o dar acceso a la herramienta de Supabase).
4. Ejecutar el script de carga desde su máquina (requiere red al SQL Server).
5. Crear el repositorio `cartera-web` en GitHub, hacer el primer push (o autorizar a Claude a hacerlo con `gh`) y poner Settings → Pages → Source = GitHub Actions.
6. Crear la cuenta del administrador y las cuentas de visualizador por invitación.

## Saldo vencido (decidido 2026-11-24)
- Quitado de los visuales del Streamlit (gráfico de cartera, columna de la tabla de indicadores, serie de la ficha de crédito) y del HTML (columna, gráfico y nota).
- Se mantiene en los cálculos internos (comisiones, cubos de coreografías): no se muestra.
- La web (Cartera y Cobros) no lo muestra.
