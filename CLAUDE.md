# NexoDigitalCRM

CRM SaaS multiempresa. Responde en español y conserva los nombres que ve el usuario.

## Desarrollo

- Monorepo npm con Node.js 24. `apps/web` usa React, Vite y TypeScript. `apps/api` usa NestJS, Prisma y PostgreSQL.
- Primera puesta en marcha local: copia `.env.example` a `.env`, ejecuta `npm ci`, `npm run db:generate`, `docker compose up -d postgres`, `npm run db:migrate` y `npm run dev`. En PowerShell usa `Copy-Item .env.example .env` si aún no existe `.env`.
- Web local en `http://localhost:5173`. API local en `http://localhost:3000/api`.
- Verificación: `npm run build`, `npm test` y `node --test apps/web/test/*.test.mjs scripts/test-appointment-reminders.mjs`. Los scripts `scripts/test-*-browser.py` usan Playwright y Chromium. Consulta cada script para sus requisitos y puerto.
- Tras cambios de Prisma, incluye la migración y vuelve a generar el cliente. Usa una base de datos local de pruebas para comprobarla.

## Administración y páginas

- En la rama `feat/platform-business-pages`, el enlace **Superadministrador** de `/registro` abre `/superadministrador`. El acceso usa la cuenta del CRM.
- `apps/web/src/access-pages.tsx` gestiona el registro y el inicio de sesión. `apps/web/src/main.tsx` decide la vista según ruta y sesión. `apps/web/src/platform-pages.tsx` contiene el editor de secciones y de páginas con bloques de encabezado y texto.
- `apps/api/src/platform/platform.module.ts` verifica los permisos en base de datos. El superadministrador gestiona todos los negocios. Una cuenta de desarrollo crea negocios por `/development/businesses` y solo lista o edita aquellos que le pertenecen. Las cuentas ordinarias quedan fuera de esos endpoints.
- La configuración se guarda por negocio en `Clinic.workspacePages`. Al modificar navegación, respeta los valores por sector y las secciones ocultas, y prueba tanto el inicio de sesión como la recarga de `/superadministrador`.
- La cuenta de desarrollo se documenta en `docs/development-account.md`. La migración del panel es `20261119170000_platform_pages`. El comando administrativo `node dist/platform/set-platform-admin.js grant|revoke correo` trabaja sobre una cuenta registrada en el CRM.

## Estado y despliegue

- GitHub privado: `jotolmor/NexoDigitalCRM`. Para continuar con el panel, usa `feat/platform-business-pages`. El cambio de redondeo de «Buscar citas» está en `main` (`7bfb05d`).
- La corrección de navegación y gestión para desarrolladores está en `4129c57`. Pasaron 120 pruebas de API y una prueba de navegador con datos simulados. En producción se detectó el código de acceso y el panel de desarrollo en el JavaScript público. Sigue pendiente verificar el acceso real, la creación de un negocio y el guardado de sus páginas con la cuenta autorizada.
- Producción: `https://nexocrm.nexodigitaldesing.com`. Comprueba `/api/health/ready` y la ruta afectada después de desplegar. La comprobación pública de la API no verifica permisos de cuenta.
- En el VPS, el código está en `/opt/nexocrm` y Compose se ejecuta desde `/opt/nexocrm-deploy` con `docker-compose.yml`, `api.yml`, `web.yml` y `public.yml`. Contrasta los cambios locales del VPS antes de aplicar parches y conserva las personalizaciones existentes.
- SSH en el puerto 22 funciona desde el PC Windows del usuario. La sesión remota de Codex recibió un rechazo. Comprueba el acceso desde el entorno actual antes de dar un despliegue por hecho. Las credenciales SSH del VPS y las del CRM son independientes.
