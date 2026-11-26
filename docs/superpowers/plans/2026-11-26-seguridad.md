# Seguridad básica de la API: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Objetivo:** aplicar los cinco puntos de `docs/superpowers/specs/2026-11-26-seguridad-design.md`.
**Arquitectura:** NestJS 11. La clave y el límite de intentos son piezas pequeñas dentro de `apps/api/src/auth/`, y el guard consulta Prisma.
**Diseño:** `docs/superpowers/specs/2026-11-26-seguridad-design.md`

## Restricciones globales
- Clave: mínimo 32 caracteres. Límite de intentos: 5 fallos en 15 minutos y bloqueo de 15 minutos por correo normalizado (`trim().toLowerCase()`).
- Los mensajes que ve el usuario van en español.
- Las 137 pruebas existentes siguen pasando.

## Puntos a revisar
1. Sesión de desarrollo en un negocio propio → acceso permitido (prueba del guard).
2. Sesión de desarrollo en un negocio ajeno, o de una cuenta que ya no es de desarrollo → 401 (prueba del guard).
3. Cambio de rol en la base de datos → la sesión usa el rol nuevo (prueba del guard).
4. Correo con mayúsculas y espacios → cuenta como el mismo correo para el límite (prueba de `LoginAttempts`).
5. Inicio de sesión correcto tras fallos → el contador vuelve a cero (prueba de `login`).

---

### Task 1: clave de sesiones obligatoria
**Archivos:** crear `apps/api/src/auth/jwt-secret.ts` y `apps/api/test/security.spec.ts`; modificar `auth.module.ts`, `jwt-auth.guard.ts` (`verify` sin `secret` explícito), `main.ts` y `docker-compose.yml`.
**Expone:** `jwtSecret(): string`.
- [ ] Prueba (`jwtSecret`): lanza un error que contiene `'JWT_SECRET'` si la variable falta o tiene 31 caracteres; devuelve el valor si tiene 32.
- [ ] Comprobar que falla, implementar y comprobar que pasa con `npm test -w @nexoclinic/api -- security`.
- [ ] Commit.

### Task 2: límite de intentos
**Archivos:** crear `apps/api/src/auth/login-attempts.ts`; modificar `auth.service.ts` (tercer parámetro del constructor, `attempts = new LoginAttempts()`) y `auth.module.ts` (`providers`); pruebas en `security.spec.ts`.
**Expone:** `class LoginAttempts { assertAllowed(email: string, now?: number): void; recordFailure(email: string, now?: number): void; reset(email: string): void }`.
- [ ] Pruebas:
  - 5 fallos dejan el correo bloqueado (429).
  - `' A@B.com '` y `'a@b.com'` cuentan como el mismo correo.
  - Pasados 15 minutos vuelve a permitir.
  - `login` con la contraseña correcta después de 4 fallos pone el contador a cero.
  - `login` bloqueado no consulta `bcrypt`.
- [ ] Comprobar que fallan, implementar y comprobar que pasan. Commit.

### Task 3: sesiones revocables
**Archivos:** modificar `jwt-auth.guard.ts` (constructor `(jwt: JwtService, prisma: PrismaService)`; `canActivate` pasa a ser asíncrono); pruebas en `security.spec.ts`.
- [ ] Pruebas:
  - Cuenta inexistente → 401.
  - Sin `sub` → 401.
  - Negocio propio → `request.user.role` igual al rol de la base de datos.
  - Negocio de desarrollo propio → se permite y se mantiene `clinicId`.
  - Negocio ajeno → 401.
  - Cuenta que ya no es de desarrollo → 401.
- [ ] Comprobar que fallan, implementar y comprobar que pasan. Ejecutar la suite completa. Commit.

### Task 4: certificado y PostgreSQL, verificación y despliegue
- [ ] Quitar las líneas del certificado de los dos Dockerfiles, borrar `docker/environment-proxy-ca.crt` y cambiar el puerto a `127.0.0.1:5432:5432`.
- [ ] Ejecutar `npm run build`, `npm test` y las pruebas de la web. Todo debe pasar.
- [ ] Crear `scripts/deploy-security.sh`: comprueba la longitud de `JWT_SECRET` sin mostrarla, copia los ficheros, reconstruye `api` y `web` y comprueba `/api/health/ready`.
- [ ] Commit.
