# Asistentes de IA con Claude Sonnet 5.5

Fecha: 2026-11-24 · Estado: aprobado

## Intención

Sustituir OpenAI por Anthropic (Claude Sonnet 5.5) en los dos asistentes del CRM: el de citas y el de turnos. Es el primer paso hacia una aplicación única para muchos sectores, en la que cada tipo de negocio tendrá su propio agente. Este cambio deja el agente preparado para recibir instrucciones y herramientas distintas, pero no introduce todavía los sectores.

## Objetivos

- `apps/api/src/assistant/assistant.service.ts` (citas) y `apps/api/src/scheduling/shift-assistant.service.ts` (turnos) llaman a Claude con el SDK oficial `@anthropic-ai/sdk`.
- Desaparece la dependencia de OpenAI: `OPENAI_API_KEY` y `OPENAI_MODEL` pasan a ser `ANTHROPIC_API_KEY` y `ANTHROPIC_MODEL` (por defecto `claude-sonnet-5-5`).
- Los dos asistentes siguen funcionando igual para el usuario: las mismas herramientas, el mismo contrato de `POST /assistant/ask`, `/assistant/confirm` y `/scheduling/assistant/*`, y la misma confirmación con botón antes de guardar.

## Fuera de alcance

- Cambiar el texto de las instrucciones por sector, que hoy hablan de clínicas. Eso llega con el trabajo por sectores.
- Cambios en la interfaz web.
- Streaming de respuestas al navegador.

## Lo que no puede pasar

- Que el asistente reserve, mueva o cancele una cita, o cambie un turno, sin que el usuario pulse Confirmar.
- Que una consulta salga de los datos del negocio de la sesión (tenant y clínica).
- Que se pierdan los mensajes de error en español que ve el usuario.

## Enfoques considerados

1. **Messages API con bucle propio (elegido).** Mantiene la estructura actual: nuestro código ejecuta las herramientas contra Prisma, limita las vueltas (4 en citas y 8 en turnos) y gestiona la acción pendiente. Es el cambio mínimo y el que da más control.
2. **Tool Runner del SDK.** Ahorra escribir el bucle, pero está en beta y complica el límite de vueltas y la captura de la acción pendiente.
3. **Managed Agents.** Anthropic ejecutaría el bucle en un entorno propio. No aporta nada aquí: las herramientas necesitan nuestra base de datos, y añade coste y latencia.

## Diseño

- **Cliente:** `new Anthropic({ apiKey, timeout: 30000, maxRetries: 2 })`. Sin `ANTHROPIC_API_KEY`, se responde `ServiceUnavailableException` con el mensaje de «asistente no conectado», que ahora dice «en el servidor» en vez de «en Render».
- **Petición:** `model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5'`, `thinking: { type: 'adaptive' }`, `output_config: { effort: 'low' }` (es un chat) y `max_tokens` suficiente para el razonamiento y la respuesta (unos 4000). Sin `temperature`. Se usa `cache_control` de nivel superior para cachear las herramientas y las instrucciones.
- **Herramientas:** se traducen al formato de Anthropic (`name`, `description`, `input_schema`) con `strict: true` y `additionalProperties: false`. Los nombres y las descripciones no cambian.
- **Bucle:** se añade `response.content` completo como turno del asistente, sin modificarlo y conservando los bloques de razonamiento. Todos los `tool_result` de una vuelta van en un único mensaje `user`; un fallo de herramienta se devuelve con `is_error: true`. Se lee el contenido por `type` y se termina cuando `stop_reason` no es `tool_use`. En turnos, la última vuelta usa `tool_choice: { type: 'none' }`, igual que ahora.
- **Fecha en turnos:** la fecha, el instante y la zona horaria salen de las instrucciones y pasan a un bloque al final del mensaje del usuario, para que la caché de las instrucciones siga valiendo.
- **Rechazos:** se usa la variante beta (`client.beta.messages.create`) con `betas: ['server-side-fallback-2026-07-01']` y `fallbacks: 'default'`. Si la respuesta final trae `stop_reason: 'refusal'`, el usuario ve un mensaje en español y no se prepara ninguna acción.
- **Errores:** las clases del SDK sustituyen a los códigos HTTP. `AuthenticationError` → «La clave de Anthropic del servidor no es válida.», `RateLimitError` → «límite o crédito», `APIConnectionError` → «No se pudo conectar con la IA…» y cualquier otro error de la API → `BadGatewayException`, como ahora.
- **Historial:** se mantiene el filtrado actual (roles `user`/`assistant`, recortes de longitud y número). El historial que manda la web es solo texto; los bloques de razonamiento solo se conservan dentro de una misma petición.

## Pruebas

- Se adapta `apps/api/test/shift-assistant.spec.ts`, que ahora simula `fetch`, para simular el cliente de Anthropic.
- Prueba nueva para el asistente de citas: sin clave, clave inválida, una vuelta con herramienta que prepara una reserva y un rechazo.
- Verificación: `npm run build`, `npm test` y `node --test apps/web/test/*.test.mjs scripts/test-appointment-reminders.mjs`.

## Documentación y despliegue

- Se actualizan `.env.example`, `README.md` y `docs/navegacion-superior.md`.
- Antes de desplegar, el usuario debe añadir `ANTHROPIC_API_KEY` en el `.env` del VPS.

## Decisiones que quedan a quien lo construya

- Cómo convertir el SDK en algo inyectable para las pruebas (por ejemplo, un proveedor de Nest o un parámetro del constructor).
- El valor exacto de `max_tokens` dentro del margen indicado.
