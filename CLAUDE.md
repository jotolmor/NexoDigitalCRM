# NexoDigitalCRM

CRM SaaS multiempresa. Responde en español y conserva los nombres que ve el usuario.

## Desarrollo

- Monorepo npm con Node.js 24. `apps/web` usa React, Vite y TypeScript. `apps/api` usa NestJS, Prisma y PostgreSQL.
- Primera puesta en marcha local: copia `.env.example` a `.env`, ejecuta `npm ci`, `npm run db:generate`, `docker compose up -d postgres`, `npm run db:migrate` y `npm run dev`. En PowerShell usa `Copy-Item .env.example .env` si aún no existe `.env`.
- Web local en `http://localhost:5173`. API local en `http://localhost:3000/api`.
- Verificación: `npm run build`, `npm test` y `node --test apps/web/test/*.test.mjs scripts/test-appointment-reminders.mjs`. Los scripts `scripts/test-*-browser.py` usan Playwright y Chromium. Consulta cada script para sus requisitos y puerto.
- Tras cambios de Prisma, incluye la migración y vuelve a generar el cliente. Usa una base de datos local de pruebas para comprobarla.

## Acceso y páginas

- `apps/web/src/access-pages.tsx` gestiona el registro y el inicio de sesión. `apps/web/src/main.tsx` decide la vista según ruta y sesión.
- El panel de superadministrador (`/superadministrador`) se quitó en la rama `feat/quitar-panel`. La columna `User.isPlatformAdmin` sigue en la base de datos sin uso.
- La navegación y las páginas personalizadas guardadas en `Clinic.workspacePages` se siguen mostrando (`apps/web/src/workspace-pages.tsx`), pero ya no hay editor. Al modificar la navegación, respeta los valores por sector y las secciones ocultas.
- Una cuenta de desarrollo crea y cambia de negocio desde el CRM por `/development/businesses` y solo ve los suyos. Se documenta en `docs/development-account.md`.

## Estado y despliegue

- GitHub privado: `jotolmor/NexoDigitalCRM`. El cambio de redondeo de «Buscar citas» está en `main` (`7bfb05d`).
- La corrección de navegación y gestión para desarrolladores está en `4129c57`. Pasaron 120 pruebas de API y una prueba de navegador con datos simulados.
- Producción: `https://nexocrm.nexodigitaldesing.com`. Comprueba `/api/health/ready` y la ruta afectada después de desplegar. La comprobación pública de la API no verifica permisos de cuenta.
- En el VPS, el código está en `/opt/nexocrm` y Compose se ejecuta desde `/opt/nexocrm-deploy` con `docker-compose.yml`, `api.yml`, `web.yml` y `public.yml`. Contrasta los cambios locales del VPS antes de aplicar parches y conserva las personalizaciones existentes.
- SSH en el puerto 22 funciona desde el PC Windows del usuario. La sesión remota de Codex recibió un rechazo. Comprueba el acceso desde el entorno actual antes de dar un despliegue por hecho. Las credenciales SSH del VPS y las del CRM son independientes.
