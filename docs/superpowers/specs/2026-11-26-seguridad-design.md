# Seguridad básica de la API

Fecha: 2026-11-26 · Estado: aprobado

## Intención

Cerrar los riesgos de seguridad detectados en la revisión del CRM de clínicas antes de darlo por terminado. Los usuarios no deben notar ningún cambio de comportamiento, salvo el bloqueo tras varios intentos fallidos de inicio de sesión.

## Lo que no puede pasar

- Que deje de funcionar el acceso de las cuentas de desarrollo a sus negocios. Su sesión lleva a propósito un `tenantId`/`clinicId` distinto del de la cuenta (`development.service.ts`).
- Que un límite de intentos bloquee a todos los usuarios a la vez porque todos llegan con la IP del proxy.
- Que se despliegue con una clave de sesiones corta o vacía.

## Diseño

1. **Clave de sesiones obligatoria.** `jwtSecret()` (`apps/api/src/auth/jwt-secret.ts`) devuelve `JWT_SECRET` y lanza un error si falta o tiene menos de 32 caracteres. `AuthModule` registra `JwtModule` con `registerAsync` usando esa función, y `main.ts` la llama al arrancar, así que la API no arranca sin una clave válida. Se elimina la clave de respaldo del código y de `docker-compose.yml` (`${JWT_SECRET:?}`).
2. **Límite de intentos.** `LoginAttempts` (`apps/api/src/auth/login-attempts.ts`) guarda en memoria los fallos por correo normalizado: 5 fallos en 15 minutos bloquean ese correo 15 minutos con un `HttpException` 429, «Demasiados intentos. Vuelve a intentarlo en unos minutos.». Un inicio de sesión correcto pone el contador a cero. Se aplica solo en `AuthService.login`.
3. **Sesiones revocables.** `JwtAuthGuard` verifica el token y después carga la cuenta (`sub`):
   - Si la cuenta no existe → 401.
   - Si el negocio del token es el de la cuenta (mismo `tenantId` y `clinicId`) → la sesión usa `tenantId`, `clinicId` y `role` de la base de datos.
   - Si es otro negocio → solo vale si la cuenta tiene `isDeveloper` y existe `DevelopmentBusiness` con `developerUserId = cuenta` y ese `clinicId`, perteneciente a ese `tenantId`. Si no, 401.
   - Un token sin `sub` → 401.
4. **Certificado de proxy.** Se quitan de `apps/api/Dockerfile` y `apps/web/Dockerfile` las líneas de `environment-proxy-ca.crt` y se borra `docker/environment-proxy-ca.crt`.
5. **PostgreSQL local.** En `docker-compose.yml`, el puerto pasa a `127.0.0.1:5432:5432`. El Compose del VPS se revisa aparte con el usuario.

## Fuera de alcance

`helmet`, renovación de tokens, límite por IP y almacenamiento compartido del contador.

## Pruebas

Pruebas nuevas para `jwtSecret`, `LoginAttempts` y su uso en `login`, y para cada rama del guard. Además, las 137 pruebas existentes deben seguir pasando.
