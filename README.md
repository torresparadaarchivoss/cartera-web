# Cartera y Cobros — versión web

Versión web del tablero de cartera y cobranza de El Salvador (origen: Streamlit). Frontend en `app/`, datos en Supabase, despliegue en GitHub Pages.

## Pasos para el usuario, en orden

1. Crear el proyecto en Supabase y entregar el **project ref** (ya entregado: `gpmdhkfslgnyfxapgqjg`).
2. Copiar `app/.env.production.example` como `app/.env.production` y pegar la **anon key**. Ese archivo no se sube a git (está en `.gitignore`).
3. Ejecutar las migraciones en el SQL Editor, en orden: `supabase/migrations/0001_esquema_base.sql`, luego `0002_funciones_seguridad.sql`.
4. Ejecutar el script de carga desde tu máquina (requiere red al SQL Server). *Pendiente: aún no está portado.*
5. En GitHub: Settings → Pages → Source = **GitHub Actions**. Para que el build tenga configuración, agregá la URL en Settings → Secrets and variables → Actions:
   - variable `VITE_SUPABASE_URL` (pestaña Variables)
   - secreto `VITE_SUPABASE_ANON_KEY` (pestaña Secrets)
6. Crear la cuenta de administrador y las cuentas de visualizador por invitación desde el panel de Supabase.

## Desarrollo local

```bash
cd app
npm install
npm run build     # typecheck + build de producción
npm run dev       # desarrollo en localhost
```

## Estado

- Listo: base de la app (login, sesión en sessionStorage, guardas de ruta, tokens de marca), esquema de acceso y RLS.
- Pendiente: portar las 14 páginas del tablero, las consultas y los cálculos, y el script de carga. Ver [docs/ORIGEN_MAPEO.md](docs/ORIGEN_MAPEO.md).
