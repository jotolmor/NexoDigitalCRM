# NexoDigitalCRM

Plataforma SaaS multi-tenant para la gestión de clínicas. La primera vertical es odontología, pero el núcleo permite configurar clínicas y especialidades adicionales.

También funciona como plataforma para negocios de servicios. Al crear una instalación se selecciona un sector y la interfaz adapta los términos de clientes, equipo, reservas y servicios. Están incluidos salud, belleza, fitness, educación, servicios profesionales, servicios a domicilio, automoción y una opción genérica.

## Arquitectura de la Fase 1

- `apps/web`: React, Vite y TypeScript. Incluye acceso, alta de clínica y dashboard.
- `apps/api`: NestJS, API REST y JWT.
- `apps/api/prisma`: modelo de PostgreSQL y migración inicial.
- `docker-compose.yml`: PostgreSQL, API y web.

La creación de una clínica se ejecuta en una única transacción: crea un tenant, una clínica y su propietario. El JWT contiene el `tenantId` y las consultas clínicas usan ese valor en el servidor. El navegador no controla el alcance del tenant.

## Requisitos

- Node.js 24 o posterior.
- Docker y Docker Compose para ejecutar todos los servicios.
- Una contraseña de desarrollo de al menos 12 caracteres al crear una cuenta.

## Desarrollo local

```bash
cp .env.example .env
npm ci
npm run db:generate
docker compose up -d postgres
npm run db:migrate
npm run dev
```

Si actualizas una instalación existente, aplica las migraciones antes de iniciar la API:

```bash
npm run db:migrate
```

La web se sirve en `http://localhost:5173` y la API en `http://localhost:3000/api`.

Para ejecutar el conjunto completo en contenedores:

```bash
docker compose up --build
```

La web queda disponible en `http://localhost:8080`.

## Verificación

```bash
npm run build
npm test
```

## Estado operativo

- `GET /api/health`: confirma que el proceso HTTP está disponible.
- `GET /api/health/ready`: confirma la conectividad con PostgreSQL; devuelve `503` mientras la base de datos no esté preparada.

Estas rutas no requieren sesión y no exponen información de pacientes ni de configuración.

## Despliegue de la API en Railway

1. Crea un proyecto Railway desde el repositorio de GitHub y añade PostgreSQL.
2. Crea un servicio desde el mismo repositorio para la API. Usa el directorio raíz `/` y el Dockerfile `apps/api/Dockerfile`.
3. En variables del servicio API configura `DATABASE_URL` con la referencia de Railway a PostgreSQL, `JWT_SECRET` con un secreto aleatorio seguro y `WEB_ORIGIN` con `https://nexodigitalcrm.pages.dev`.
4. El Dockerfile ejecuta `prisma migrate deploy` antes de arrancar la API, así que no hace falta configurar un comando de inicio adicional.
5. Genera un dominio público para la API y verifica `/api/health/ready`.
6. En Cloudflare Pages, añade `VITE_API_URL=https://TU-DOMINIO-API/api` como variable de compilación y vuelve a desplegar.

## Seguridad y alcance actual

- Las contraseñas se almacenan con bcrypt.
- Las sesiones usan JWT de corta duración. Define un `JWT_SECRET` aleatorio y seguro fuera del repositorio antes de desplegar.
- El modelo incluye `tenantId` en las entidades clínicas y las rutas de datos lo aplican en el backend.
- No se incluyen datos de pacientes ni secretos.
- La gestión de pacientes, agenda, roles configurables, MFA, auditoría, documentos e integraciones forman parte de las siguientes entregas de la Fase 1 y fases posteriores.

La implementación sanitaria avanzada, el cumplimiento legal y las integraciones clínicas requieren validación especializada antes de producción.

## API de operaciones de clínica

Las rutas siguientes requieren un JWT obtenido en `/api/auth/login` o `/api/auth/register`. Los datos se limitan en el servidor al tenant y a la clínica incluidos en la sesión.

- `GET` y `POST /api/patients`: búsqueda y alta de pacientes.
- `GET` y `POST /api/professionals`: profesionales de la clínica.
- `GET` y `POST /api/services`: catálogo de servicios, duración y precio en euros (hasta dos decimales).
- `POST /api/professionals/:professionalId/services/:serviceId`: asigna un servicio de la misma clínica a un profesional.

Solo propietario, director, recepción y personal administrativo pueden crear o asociar recursos. Las rutas rechazan identificadores de otra clínica.

Los horarios semanales se configuran por trimestre y profesional. Cada tramo se repite en su día de la semana solo dentro de las fechas de vigencia seleccionadas; el calendario trimestral calcula la disponibilidad usando esos tramos, las citas y las ausencias.
