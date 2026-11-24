# CLAUDE.md — cartera-web

## Stack técnico (decisión explícita)
- Frontend: Vite + React + TypeScript en app/, desplegado a GitHub Pages con GitHub Actions.
- Backend: Supabase (Postgres + Auth + RLS). Sin servidor propio.
- Origen: migrado desde el tablero Streamlit + SQL Server (C:\Users\jctorresp\Videos\dashboard_cartera), que queda sin cambios.
- Motivo de la excepción al stack por defecto: el tablero es una app web con autenticación y RLS; no requiere infraestructura on-prem.

## Reglas de trabajo
- No leer archivos .env ni variables de entorno. La carpeta Envir/ del origen tampoco se lee.
- Ningún secreto ni dato real en el repositorio. Los datos de data/ del origen nunca se copian aquí.
- Cambios: typecheck y build antes de commit (`npm run build` dentro de app/); no hacer push sin autorización.
- Los datos de prueba son sintéticos o de un mes/país acotado.

## Datos
- Ventana rodante de 1 mes (solo el mes en curso); carga desde scripts/ fuera de la app.
- Límite del plan gratuito de Supabase: 500 MB.
- Saldo vencido: no se muestra en la web.

## Marca
- Usar la skill marca-instacredit para cualquier pantalla con identidad Instacredit.
- Paleta: verde #4B9D45 y navy #06255B; títulos en Inter Tight; voz en voseo.
- Tokens en app/src/styles/theme.css (única fuente de color).
