# Prompt: migrar un proyecto Streamlit a la versión web (Vite + React + Supabase + GitHub Pages)

Este documento es un prompt para Claude Code. Pégalo tal cual en una sesión nueva, reemplazando solo los valores entre `{{ }}` de la sección 1. El agente debe leer el proyecto de origen, generar un proyecto nuevo en una carpeta separada y dejar todo listo para revisión, sin reemplazar ni modificar el original.

---

## 0. Instrucciones para el agente (léelas completas antes de empezar)

Eres un ingeniero que migra un tablero de Streamlit a una aplicación web estática con datos en Supabase. Trabaja de forma autónoma: toma las decisiones por defecto que se describen aquí, regístralas en el reporte final y no hagas preguntas salvo que el texto lo pida explícitamente (sección 9).

**Reglas no negociables**
1. **El proyecto de origen es de solo lectura.** No edites, renombres, muevas ni borres nada dentro de `{{RUTA_ORIGEN}}`. Todo lo nuevo va en `{{RUTA_DESTINO}}`.
2. **No leas, indexes ni cites archivos `.env`, variables de entorno, claves, tokens ni credenciales**, ni del origen ni del destino. Si el origen tiene credenciales de base de datos, no las abras: usa solo los nombres de variables que el código referencia (por ejemplo `os.environ["DWH_PASSWORD"]`) y déjalas como están.
3. **Ninguna clave secreta entra al repositorio.** Solo la `anon key` (pública) puede ir en `app/.env.production`, y solo si el usuario la entrega. Si no está disponible, deja `app/.env.production.example` con marcadores y documenta el paso.
4. **Ningún dato real entra al repositorio.** Las cargas de datos reales viven fuera del repo (en una carpeta de datos del usuario). Los seeds versionados solo contienen datos sintéticos o marcadores. Sin nombres de clientes, sin correos reales, sin números de cuenta.
5. **No mezcles la carga de datos con la app.** La app solo lee de Supabase. La carga la hace un script aparte que el usuario ejecuta en su máquina, porque solo ahí existe acceso de red al origen de datos.
6. **Verifica antes de dar por terminado.** Compila, construye y ejecuta las pruebas que se describen en la sección 8. Si algo no se puede verificar aquí (por ejemplo, el despliegue a GitHub Pages), dilo en el reporte; no lo des por hecho.

---

## 1. Parámetros (completar antes de lanzar)

| Parámetro | Valor |
|---|---|
| `{{RUTA_ORIGEN}}` | Carpeta del proyecto Streamlit, por ejemplo `C:\Users\<usuario>\Videos\<proyecto>` |
| `{{RUTA_DESTINO}}` | Carpeta nueva, por ejemplo `C:\Users\<usuario>\Videos\<proyecto>_web` (debe no existir) |
| `{{NOMBRE_REPO}}` | Nombre del repositorio en GitHub, en minúsculas con guiones, por ejemplo `tiempos-web`. Define el `base` de Vite |
| `{{TITULO_APP}}` | Título de la pestaña del navegador, por ejemplo `Tiempos de formalización · Instacredit` |
| `{{PAISES}}` | Lista de países con su `id` (si el origen tiene varios) |
| `{{VENTANA_MESES}}` | Meses de historia que se cargan, por defecto `3` |
| `{{SUPER_ADMIN}}` | Correo del super administrador. **Va solo como marcador `{{SUPER_ADMIN}}` en el seed versionado**; el valor real lo pone el usuario en su consola |

Si un parámetro no se completó, usa el valor por defecto indicado y regístralo en el reporte.

---

## 2. Qué debes entregar

Una carpeta `{{RUTA_DESTINO}}` con esta estructura (puedes añadir lo que el proyecto necesite, pero no quitar lo indicado):

```
{{RUTA_DESTINO}}/
├── CLAUDE.md                      ← config del proyecto (sección 4)
├── README.md                      ← pasos para el usuario, en orden, en menos de una página
├── .gitignore                     ← node_modules, dist, .env, .env.local, *.log, datos/, output/
├── docs/
│   ├── MIGRACION.md               ← reporte: decisiones, mapeo de páginas, pendientes
│   └── ORIGEN_MAPEO.md            ← tabla: cada página/KPI/gráfico del origen → archivo nuevo
├── app/                           ← Vite + React + TypeScript
│   ├── index.html                 ← <title> = {{TITULO_APP}}
│   ├── vite.config.ts             ← base: '/{{NOMBRE_REPO}}/'
│   ├── package.json               ← scripts: dev, build ("tsc -b && vite build"), preview
│   ├── .env.production.example    ← marcadores, sin claves
│   ├── public/brand/              ← logos, isotipo, poses de la mascota (desde la skill de marca)
│   └── src/
│       ├── main.tsx
│       ├── App.tsx                ← HashRouter, rutas, guardas de sesión y de admin
│       ├── index.css              ← estilos de marca, usando variables de theme
│       ├── styles/theme.css       ← tokens de color y tipografía (única fuente de color)
│       ├── lib/supabase.ts        ← cliente con sessionStorage
│       ├── lib/auth.tsx           ← sesión, perfil, países asignados
│       ├── lib/fechas.ts          ← fechas locales, formato dd/mm/aaaa
│       ├── types/database.types.ts← generado desde Supabase (o marcador si aún no hay proyecto)
│       ├── components/            ← Layout, Kpi, Cabecera, Grafico (Plotly), ErrorBoundary
│       └── pages/                 ← una página por cada página del origen
├── supabase/
│   ├── migrations/                ← 0001_esquema_base.sql, 0002_..., numeradas, una idea por archivo
│   └── seed/                      ← solo datos sintéticos y marcadores
├── scripts/                       ← extracción/carga desde el origen (Python), fuera del navegador
└── .github/workflows/pages.yml    ← build de app/ y despliegue a GitHub Pages
```

---

## 3. Procedimiento (en este orden)

### Fase A — Inventario del origen (solo lectura)
1. Lista todas las páginas, vistas, `st.` widgets, filtros de la barra lateral, KPIs, gráficos, tablas, descargas y textos de preguntas o ayuda.
2. Localiza todas las consultas SQL (archivos `.sql`, cadenas dentro de `.py`). Para cada una anota: tablas, parámetros, si usa fechas, si está dentro de un bucle o cache.
3. Identifica la lógica de negocio que vive en Python (calendario hábil, SLA, bins de horas, clasificaciones, asuetos) y dónde está escrita.
4. Identifica la configuración (constantes, listas, parámetros de país) y los catálogos (estados, usuarios, roles).
5. Registra todo en `docs/ORIGEN_MAPEO.md`. Si algo no tiene equivalente, márcalo como **pendiente** con la razón.

### Fase B — Diseño de datos en Supabase
Reglas del modelo (aplican siempre):
- **Solo los datos que la app muestra.** No cargues campos que no aparecen en pantalla; no cargues datos personales de clientes.
- **Ventana rodante.** Solo se guardan los últimos `{{VENTANA_MESES}}` meses. Una función `aplicar_ventana(p_desde)` y otra `liberar_mes_antiguo(p_desde)` se encargan de eliminar el mes que sale y cargar el que entra.
- **Agregados para el resumen.** Las vistas de resumen mensual se guardan como tabla agregada (`resumen_mensual`) para que la pantalla de inicio no recalcule sobre todo el detalle.
- **Consecutivos, no identificadores sensibles.** Un número de solicitud consecutivo puede guardarse tal cual.
- **Catálogos con clave foránea** para países, estados y roles. Nunca texto libre para algo que es un dominio cerrado.
- **Columnas explícitas** en funciones y vistas. Prohibido `select *` en funciones.
- **Nombre explícito** para cada `primary key`, `foreign key`, `unique`, `check` e índice. Nunca el autogenerado.
- **`creado_en` / `actualizado_en`** en toda tabla mutable. Las tablas de carga pueden usar `cargado_en`.
- **Coherencia temporal:** `check (fecha_fin >= fecha_inicio)` donde aplique.
- **Índices** por país + fecha y por las claves de filtro más usadas. Después de cargar datos: `analyze`.

Seguridad (siempre):
- **RLS habilitado en todas las tablas** de negocio y de perfil.
- **Funciones auxiliares `SECURITY DEFINER`** con `set search_path = public`: `es_super_admin()`, `paises_del_usuario()`, `es_admin_de_pais(p)`. Todas las políticas las usan; nunca se repite una subconsulta en cada política.
- **Escritura de perfiles y accesos solo para el administrador.** Un visualizador no puede cambiar su propio rol ni su país.
- **Visualizador por defecto:** cuentas nuevas con `es_admin = false`, `es_admin_pais = false` y acceso a todos los países.
- **Funciones de consulta con `set statement_timeout`** (por ejemplo 90 s) y `security invoker` salvo que haga falta lo contrario.
- **Funciones de carga** (`aplicar_ventana`, `liberar_mes_antiguo`) solo para el administrador: `revoke execute ... from anon, authenticated`.
- **Tablas de staging `unlogged`** sin RLS, documentadas como no accesibles desde la app.

Migraciones: una por bloque lógico, con comentario de cabecera (qué hace, orden, quién la ejecuta). Pon primero el esquema base, luego catálogos, luego funciones, luego índices.

### Fase C — Frontend
Stack: React 18+ o 19, Vite, TypeScript, `react-router-dom` con **HashRouter** (evita 404 al recargar en GitHub Pages), `@supabase/supabase-js`, `react-plotly.js` con `plotly.js-dist-min`.

Decisiones obligatorias:
- **`vite.config.ts`:** `base: '/{{NOMBRE_REPO}}/'`. Sin esto los assets dan 404.
- **Cliente Supabase:** `auth: { storage: window.sessionStorage, persistSession: true, autoRefreshToken: true }`.
- **Guardas:** `Protegido` (sin sesión → `/login`) y `SoloAdmin` (sin `es_admin` → redirige). Un visualizador no ve la ruta de parámetros.
- **Fechas:** nunca `toISOString()` para fechas de negocio (cambia el día después de cierta hora por UTC). Usa `ymd(date)` local, y muestra fechas en `dd/mm/aaaa`.
- **Entradas de fecha vacías:** no envíes el valor vacío a la base; ignóralo.
- **ErrorBoundary** alrededor de las páginas. Muestra el mensaje de error; nunca una pantalla en blanco.
- **Configuración faltante:** si no hay URL o clave, muestra un aviso claro en vez de fallar en silencio.
- **Un solo origen de color:** `styles/theme.css` con variables; los componentes usan variables, no hex sueltos. Si la paleta de la skill de marca difiere de la del origen, usa la skill y anota la decisión.
- **Gráficos:** Plotly con colores de marca. Limita las leyendas y los márgenes para que quepan en móvil.
- **Ancho de teléfono:** 16 px de margen lateral, sin scroll horizontal de la página (las tablas tienen su propio contenedor con scroll).
- **Pantallas con datos pesados:** cargar solo lo necesario; agregar en la base, no en el navegador.

Páginas: cada página del origen tiene su archivo, con la misma información, mismos filtros y mismas preguntas o textos de ayuda. El menú lateral tiene país, filtro de resultado (si aplica) y la lista de secciones. La página de parámetros se oculta a no administradores.

### Fase D — Lógica migrada desde Python
- **Portar la lógica a SQL o a funciones de base** cuando se consulta con filtros o agregados. Mantén en el frontend solo formateo y presentación.
- **Calendario hábil y asuetos:** tabla `asueto` por país; la función que calcula horas hábiles lee de esa tabla, no de constantes en código.
- **Parámetros configurables** (por ejemplo SLA en horas y roles que cuentan como DAC) en `parametro_pais`, editables desde la app por el administrador. Recarga la vista tras guardar para que el cambio se vea.

### Fase E — Scripts de carga (fuera de la app)
- Carpeta `scripts/`, en Python. Lee la configuración de variables de entorno cuyo nombre aparece en el origen; nunca las imprimas ni las escribas en archivos.
- **Parámetros de fecha como parámetro de consulta, nunca como texto literal.** El origen puede interpretar `'2026-08-10'` como otra fecha según el idioma del servidor.
- **Enteros:** exporta sin decimales (`Int64` en pandas). Un `23.0` rompe la carga en Postgres.
- **Carga:** CSV temporales y `\copy` a tablas `stg_*`; luego la función de ventana. Nunca insertar fila por fila.
- **Tamaño:** antes de cargar, estima el espacio. Si el plan es gratuito (500 MB), deja margen y aborta si se acerca al límite.
- **Modo de prueba** con un país o un mes pequeño antes de la carga completa.
- Un solo script puede lanzarse de forma programada más adelante; por ahora basta con ejecutarlo a mano.

### Fase F — Pruebas y despliegue
- `npm ci`, `npm run build` (debe compilar sin errores de TypeScript).
- Revisa que `dist/index.html` apunte a `/{{NOMBRE_REPO}}/assets/...`.
- Prueba de rutas: abrir cada hash (`#/resumen`, etc.) desde cero.
- Prueba de roles: un visualizador no debe ver parámetros ni datos de países fuera de su acceso (verifica con consultas SQL con `set role authenticated` y un `request.jwt.claims` simulado, o pide al usuario una cuenta de prueba).
- `.github/workflows/pages.yml`: `working-directory: app` para install y build; `path: app/dist` para el artefacto; Node 20; `actions/configure-pages`, `upload-pages-artifact`, `deploy-pages`.
- No hagas push. Deja los commits preparados y el comando de push en el reporte.

---

## 4. Contenido obligatorio de `CLAUDE.md` del proyecto nuevo

```markdown
# CLAUDE.md — {{NOMBRE_REPO}}

## Stack técnico (decisión explícita)
- Frontend: Vite + React + TypeScript en app/, desplegado a GitHub Pages con GitHub Actions.
- Backend: Supabase (Postgres + Auth + RLS). Sin servidor propio.
- Origen: migrado desde un tablero Streamlit + SQL Server ({{RUTA_ORIGEN}}), que queda sin cambios.
- Motivo de la excepción al stack por defecto: el tablero es una app web con autenticación y RLS; no requiere infraestructura on-prem.

## Reglas de trabajo
- No leer archivos .env ni variables de entorno.
- Ningún secreto ni dato real en el repositorio.
- Cambios: typecheck y build antes de commit; no hacer push sin autorización.
- Los datos de prueba son sintéticos o de un mes/país acotado.

## Datos
- Ventana rodante de {{VENTANA_MESES}} meses; carga desde scripts/ fuera de la app.
- Límite del plan gratuito: 500 MB.

## Marca
- Usar la skill marca-instacredit para cualquier pantalla con identidad Instacredit.
```

---

## 5. Decisiones por defecto (si el usuario no indicó otra cosa)

| Tema | Por defecto |
|---|---|
| Storage de sesión | sessionStorage |
| Tipos de base | `database.types.ts` generado; si no hay proyecto aún, marcador y nota en README |
| Estructura | Repositorio plano: `app/`, `supabase/`, `scripts/` en la raíz |
| Idioma de la UI | Español; fechas `dd/mm/aaaa`; números con separador de la región |
| Usuarios nuevos | Invitación por correo desde el panel de Supabase; sin clave genérica |
| Alta de países | Los del origen; cada país con su calendario de asuetos |
| Ruta de parámetros | Solo administrador |

Cualquier otra decisión que tomes, regístrala en `docs/MIGRACION.md` con el motivo.

---

## 6. Lo que el agente no puede hacer solo (límites reales)

Estos pasos requieren al usuario. Agrúpalos en un único checklist al final del README:
1. Crear el proyecto en Supabase y entregar el `project ref`.
2. Pegar la `anon key` en `app/.env.production` (el agente no la lee ni la escribe).
3. Ejecutar las migraciones en el SQL Editor, en orden (o dar acceso a la herramienta de Supabase si está disponible).
4. Ejecutar el script de carga desde su máquina (requiere red al origen de datos).
5. Crear el repositorio en GitHub, hacer el primer push y poner Settings → Pages → Source = GitHub Actions.
6. Crear la cuenta del administrador y las cuentas de visualizador (invitación por correo).

---

## 7. Reglas de calidad para el reporte final

El reporte (`docs/MIGRACION.md`) incluye:
- Tabla de paridad: cada KPI, gráfico, tabla y filtro del origen → su equivalente nuevo → estado (listo / parcial / pendiente).
- Decisiones tomadas y su motivo.
- Resultado de cada verificación de la sección 8, con la salida real.
- Pendientes con dueño (agente o usuario).
- Riesgos conocidos (por ejemplo: límite de tiempo de las consultas en países con más volumen, tamaño de la base).

No declares "terminado" una parte que no verificaste.

---

## 8. Verificación mínima antes de entregar

- [ ] `npm run build` sin errores.
- [ ] Ninguna cadena de conexión, clave o correo real en el repositorio (busca en todo el árbol, sin leer `.env`).
- [ ] `vite.config.ts` con `base` correcto.
- [ ] Todas las rutas del menú abren con HashRouter.
- [ ] La ruta de parámetros redirige a un visualizador.
- [ ] Cada migración tiene cabecera y ninguna usa `select *` en funciones.
- [ ] Todas las tablas de negocio tienen RLS.
- [ ] Ninguna función `SECURITY DEFINER` sin `set search_path`.
- [ ] `pages.yml` apunta a `app/` y a `app/dist`.
- [ ] `docs/ORIGEN_MAPEO.md` no deja ninguna página del origen sin equivalente o sin nota de pendiente.

---

## 9. Cuándo sí preguntar al usuario

Pregunta solo si se cumple una de estas condiciones, y junta todas las preguntas en un solo mensaje:
- Falta un parámetro obligatorio de la sección 1.
- El origen contiene datos personales de clientes en un lugar que la app necesitaría mostrar. Antes de decidir, pregunta si se pueden excluir.
- Una acción sería irreversible o afectaría a algo fuera de `{{RUTA_DESTINO}}` (borrar, subir al remoto, ejecutar SQL contra una base real).

Para todo lo demás, decide con el criterio de este documento y regístralo.

---

## 10. Entrega

Al terminar, responde con:
1. La ruta de `{{RUTA_DESTINO}}`.
2. El checklist de la sección 6, con lo que ya está hecho y lo que falta.
3. Los pendientes que bloquean producción, en orden de prioridad.
4. El comando exacto para hacer push cuando el usuario lo autorice.
