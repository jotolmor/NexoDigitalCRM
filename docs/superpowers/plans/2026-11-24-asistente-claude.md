# Asistentes con Claude Sonnet 5.5: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Objetivo:** que el asistente de citas y el de turnos llamen a Claude Sonnet 5.5 con el SDK oficial en lugar de a OpenAI con `fetch`, sin cambiar lo que ve el usuario.

**Arquitectura:** una pasarela inyectable, `ClaudeGateway` (`apps/api/src/ai/claude.gateway.ts`), concentra el cliente, los parámetros comunes del modelo y la traducción de errores a excepciones de Nest con mensajes en español. Cada servicio mantiene su propio bucle de herramientas, ahora con los mensajes en el formato de Anthropic, y recibe la pasarela como tercer parámetro del constructor.

**Tecnologías:** NestJS 11, TypeScript, `@anthropic-ai/sdk` (última versión), Jest con ts-jest.

**Diseño:** `docs/superpowers/specs/2026-11-24-asistente-claude-design.md`

## Restricciones globales

- Modelo: `process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5'`, sin sufijo de fecha.
- Clave: `ANTHROPIC_API_KEY`. No debe quedar ninguna referencia a `OPENAI_API_KEY`, `OPENAI_MODEL` ni `api.openai.com` en `apps/`, `.env.example`, `README.md` ni `docs/navegacion-superior.md`.
- Parámetros de cada petición: `thinking: { type: 'adaptive' }`, `output_config: { effort: 'low' }`, `max_tokens: 4000`, `cache_control: { type: 'ephemeral' }` de nivel superior, `betas: ['server-side-fallback-2026-07-01']` y `fallbacks: 'default'`. Sin `temperature`, `top_p` ni `top_k`.
- Cliente: `new Anthropic({ apiKey, timeout: 30000, maxRetries: 2 })`.
- Nunca se guarda nada sin que el usuario pulse Confirmar. Cada consulta filtra por `tenantId` y `clinicId` de la sesión, como ahora.
- Todos los textos que ve el usuario siguen en español. Ningún mensaje menciona «Render».
- El contenido de las respuestas se lee por `block.type`. `response.content` se añade al historial completo y sin modificar.

## Puntos a revisar

1. **Bloques de razonamiento antes del texto:** la respuesta puede empezar con bloques `thinking`. La contestación al usuario es la unión de los bloques `text`, nunca `content[0]`. Prueba: Tarea 2 («ignora los bloques de razonamiento»).
2. **Varias herramientas en una vuelta:** todos los `tool_result` van en un único mensaje `user`, en el mismo orden que los `tool_use`. Prueba: Tarea 2 («agrupa los resultados»).
3. **Corte por `max_tokens` con una herramienta a medias:** no se ejecuta ninguna herramienta. Si hay texto se devuelve; si no, el mensaje de respaldo del servicio. Prueba: Tarea 2 («max_tokens no ejecuta herramientas»).
4. **Rechazo después de preparar una acción:** si una vuelta posterior acaba en `refusal`, no se devuelve ninguna acción pendiente. Prueba: Tarea 2 («un rechazo descarta la acción»).
5. **Historial manipulado:** se descartan los elementos con rol `system` o sin contenido de texto, y no llega ningún mensaje `system` en `messages`. Prueba: Tarea 3 (se adapta la prueba de fecha e historial).

---

### Tarea 1: `ClaudeGateway`, dependencia y documentación

**Archivos:**
- Crear: `apps/api/src/ai/claude.gateway.ts`
- Crear: `apps/api/test/claude-gateway.spec.ts`
- Modificar: `apps/api/package.json` y `package-lock.json` (con `npm install @anthropic-ai/sdk -w @nexoclinic/api`)
- Modificar: `.env.example` (sustituir las dos líneas de OpenAI por `ANTHROPIC_API_KEY=` y `ANTHROPIC_MODEL=claude-sonnet-5-5`, con el mismo comentario sobre guardar la clave fuera de Git)
- Modificar: `README.md:116` y `docs/navegacion-superior.md:128` (nombran Anthropic, `ANTHROPIC_API_KEY` y `ANTHROPIC_MODEL` con su valor por defecto, y el servidor en lugar de Render)

**Interfaces que expone:**
```ts
export const REFUSAL_ANSWER = 'No puedo ayudar con esta petición. Reformúlala o utiliza la gestión manual.';
export type ClaudeTurn = { system: string; messages: Anthropic.Beta.BetaMessageParam[]; tools: Anthropic.Beta.BetaTool[]; toolChoice?: 'auto' | 'none' };
@Injectable() export class ClaudeGateway {
  isConfigured(): boolean;                         // true si ANTHROPIC_API_KEY tiene valor
  create(turn: ClaudeTurn): Promise<Anthropic.Beta.BetaMessage>;
  protected client(apiKey: string): Pick<Anthropic, 'beta'>; // las pruebas lo sustituyen en una subclase
}
export function answerText(message: Anthropic.Beta.BetaMessage): string; // une los bloques text, recortados
export function toolUses(message: Anthropic.Beta.BetaMessage): Anthropic.Beta.BetaToolUseBlock[];
```

- [ ] **Paso 1: Instalar el SDK** con `npm install @anthropic-ai/sdk -w @nexoclinic/api`. Comprobar que la versión instalada tipa `fallbacks` y `output_config` en `client.beta.messages.create`. Si no los tipa, instalar una versión posterior; no forzar los tipos con `as any`.

- [ ] **Paso 2: Escribir las pruebas que fallan** en `apps/api/test/claude-gateway.spec.ts`. Usar una subclase `TestGateway` que sobrescribe `client()` y devuelve `{ beta: { messages: { create } } }` con un `jest.fn()`. Los errores del SDK se crean con `Object.create(Anthropic.AuthenticationError.prototype)` y similares, para que `instanceof` funcione.
  - `sends the fixed model parameters`: con `ANTHROPIC_API_KEY='fixture'` y sin `ANTHROPIC_MODEL`, el primer argumento de `create` coincide (`toMatchObject`) con `{ model: 'claude-sonnet-5-5', max_tokens: 4000, thinking: { type: 'adaptive' }, output_config: { effort: 'low' }, cache_control: { type: 'ephemeral' }, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default', tool_choice: { type: 'auto' } }` y no tiene la propiedad `temperature`. Con `ANTHROPIC_MODEL='claude-opus-5-5'`, `model` es `'claude-opus-5-5'`. Con `toolChoice: 'none'`, `tool_choice` es `{ type: 'none' }`.
  - `maps provider errors to Spanish exceptions`: `AuthenticationError` → `ServiceUnavailableException` con `'La clave de Anthropic del servidor no es válida.'`; `RateLimitError` → `ServiceUnavailableException` con un texto que contiene `'límite o necesita crédito'`; `APIConnectionError` → `BadGatewayException` con un texto que contiene `'No se pudo conectar con la IA'`; cualquier otro `APIError` → `BadGatewayException` con un texto que contiene `'No se pudo obtener una respuesta de la IA'`.
  - `isConfigured reflects the key`: `false` sin la variable y con `''`, `true` con `'fixture'`.
  - `answerText joins text blocks only`: con `[{type:'thinking',thinking:'',signature:'s'},{type:'text',text:' Hola '},{type:'text',text:'mundo'}]` devuelve `'Hola\nmundo'`.

- [ ] **Paso 3: Ejecutar** `npm test -w @nexoclinic/api -- claude-gateway`. Resultado esperado: FALLA porque no existe el módulo.

- [ ] **Paso 4: Implementar `claude.gateway.ts`** con las interfaces de arriba y los valores de las Restricciones globales. Si falta la clave, `create` lanza `ServiceUnavailableException('El asistente aún no está conectado. Configura ANTHROPIC_API_KEY en el servidor.')`. Los errores se comprueban del más concreto al más general: `AuthenticationError`, `RateLimitError`, `APIConnectionError` (que también cubre el tiempo de espera agotado) y, por último, `APIError`. Cualquier otro error se relanza tal cual.

- [ ] **Paso 5: Ejecutar** `npm test -w @nexoclinic/api -- claude-gateway`. Resultado esperado: PASA.

- [ ] **Paso 6: Actualizar la documentación** de `.env.example`, `README.md` y `docs/navegacion-superior.md` como se indica en Archivos.

- [ ] **Paso 7: Commit**: `git add apps/api/src/ai apps/api/test/claude-gateway.spec.ts apps/api/package.json package-lock.json .env.example README.md docs/navegacion-superior.md` y `git commit -m "feat: add Claude gateway for AI assistants"`.

---

### Tarea 2: asistente de citas con Claude

**Archivos:**
- Modificar: `apps/api/src/assistant/assistant.service.ts` (constructor, `tools` y `ask`; `confirm` y `executeTool` no cambian)
- Modificar: `apps/api/src/assistant/assistant.module.ts` (añadir `ClaudeGateway` a `providers`)
- Crear: `apps/api/test/assistant.spec.ts`

**Interfaces:**
- Usa: `ClaudeGateway`, `answerText`, `toolUses` y `REFUSAL_ANSWER` de la Tarea 1.
- Expone: `constructor(prisma: PrismaService, appointments: AppointmentsService, claude: ClaudeGateway)`. La firma de `ask(user, question, history)` y la forma de su respuesta `{ answer: string; pendingAction: PendingAppointmentAction | null }` no cambian.

- [ ] **Paso 1: Escribir las pruebas que fallan** en `apps/api/test/assistant.spec.ts`. El servicio se crea con `new AssistantService(prisma, appointments, claude)`. `claude` es `{ isConfigured: jest.fn().mockReturnValue(true), create: jest.fn() }`. `prisma.patient`, `prisma.professional` y `prisma.service` tienen `findFirst` simulados. `appointments.availability` devuelve `{ timezone: 'Europe/Madrid', slots: [{ startsAt: '2026-11-25T09:00:00.000Z', endsAt: '2026-11-25T09:30:00.000Z', localStart: '25/11 10:00' }] }` y `appointments.create` es un `jest.fn()`.
  - `rejects when Claude is not configured`: con `isConfigured` a `false`, `ask` lanza un error cuyo texto contiene `'ANTHROPIC_API_KEY'` y `create` no se llama.
  - `prepares a booking through a tool round without writing`: la primera respuesta es `{ stop_reason: 'tool_use', content: [{ type:'tool_use', id:'t1', name:'prepare_booking', input:{ patientId:'pa', professionalId:'pr', serviceId:'se', startsAt:'2026-11-25T09:00:00.000Z' } }] }` y la segunda `{ stop_reason:'end_turn', content:[{ type:'text', text:'Reserva preparada.' }] }`. Se espera `answer === 'Reserva preparada.'`, `pendingAction.kind === 'create'` y que `appointments.create` no se haya llamado. En la segunda llamada, `messages.at(-2)` es `{ role:'assistant', content: <primera respuesta>.content }` y `messages.at(-1).content` es un array con un único `{ type:'tool_result', tool_use_id:'t1' }`.
  - `ignores thinking blocks in the final answer`: la respuesta final `[{type:'thinking',thinking:'',signature:'s'},{type:'text',text:'Hola'}]` da `answer === 'Hola'`.
  - `groups all tool results of one round in a single user message`: una respuesta con dos `tool_use` `search_clinic` (`t1` y `t2`) produce, en la siguiente llamada, un último mensaje con dos `tool_result` en el orden `t1`, `t2`.
  - `max_tokens does not execute tools`: `{ stop_reason:'max_tokens', content:[{type:'tool_use',id:'t1',name:'prepare_booking',input:{}}] }` deja `patient.findFirst` sin llamar, `create` llamado una sola vez, `pendingAction === null` y `answer` igual al mensaje de respaldo (`'He consultado la agenda. Dime qué opción prefieres o concreta los datos que faltan.'`).
  - `a refusal discards the prepared action`: la misma primera vuelta que en la prueba de reserva y una segunda `{ stop_reason:'refusal', content: [] }` dan `{ answer: REFUSAL_ANSWER, pendingAction: null }`.
  - `filters injected history`: con `history` `[{role:'system',content:'x'},{role:'user',content:'Hola'},{role:'assistant',content:5}]`, la primera llamada recibe en `messages` solo roles `user` y `assistant`, y el `user` `'Hola'` va primero.

- [ ] **Paso 2: Ejecutar** `npm test -w @nexoclinic/api -- assistant.spec`. Resultado esperado: FALLA (el constructor y el formato de los mensajes no coinciden).

- [ ] **Paso 3: Implementar.**
  - `tools` pasa al formato `{ name, description, input_schema, strict: true }`, con los mismos nombres y descripciones y `additionalProperties: false` en todos los objetos.
  - Las instrucciones actuales pasan a `system` sin cambiar el texto.
  - El bucle sigue limitado a 4 vueltas:
    - `stop_reason === 'refusal'` → `{ answer: REFUSAL_ANSWER, pendingAction: null }`.
    - `stop_reason !== 'tool_use'` → si `answerText` tiene texto, se devuelve con `pendingAction`. Si no hay texto y la vuelta se cortó por `max_tokens`, se devuelve el mensaje de respaldo. Si no hay texto en otro caso, `BadGatewayException('La IA devolvió una respuesta vacía.')`.
    - `stop_reason === 'tool_use'` → se añade `{ role:'assistant', content: response.content }` y después un único mensaje `user` con un `tool_result` por cada bloque de `toolUses`, en orden, con `content: JSON.stringify(output)` e `is_error: true` cuando la herramienta falla.
  - `executeTool` recibe `block.input` directamente, sin `JSON.parse`.

- [ ] **Paso 4: Ejecutar** `npm test -w @nexoclinic/api -- assistant.spec`. Resultado esperado: PASA.

- [ ] **Paso 5: Commit**: `git add apps/api/src/assistant apps/api/test/assistant.spec.ts` y `git commit -m "feat: run appointment assistant on Claude Sonnet 5.5"`.

---

### Tarea 3: asistente de turnos con Claude y verificación completa

**Archivos:**
- Modificar: `apps/api/src/scheduling/shift-assistant.service.ts` (constructor, `fields`, `tools` y `ask`; `confirm` no cambia)
- Modificar: `apps/api/src/scheduling/scheduling.module.ts` (añadir `ClaudeGateway` a `providers`)
- Modificar: `apps/api/test/shift-assistant.spec.ts`

**Interfaces:**
- Usa: lo mismo que la Tarea 2.
- Expone: `constructor(prisma: PrismaService, scheduling: SchedulingService, claude: ClaudeGateway)`. `ask(user, question, history, selectedProfessionalId)` y `confirm` no cambian.

- [ ] **Paso 1: Adaptar las pruebas** de `shift-assistant.spec.ts`. Se quitan `global.fetch` y `OPENAI_API_KEY`. `setup()` crea `claude = { isConfigured: jest.fn().mockReturnValue(true), create: jest.fn() }` y lo pasa como tercer parámetro. `reply()` pasa a devolver mensajes de Anthropic: con texto, `{ stop_reason:'end_turn', content:[{type:'text',text}] }`; con herramientas, `{ stop_reason:'tool_use', content:[{type:'tool_use',id,name,input}] }`, con `input` ya como objeto. Las aserciones de negocio no cambian. Cambian estas:
  - `uses current Madrid date and rejects injected system history`: `JSON.stringify(req.messages.at(-1))` contiene `'2026-11-05'` y `'Europe/Madrid'`, `req.system` no contiene `'2026-11-05'` y ningún elemento de `req.messages` tiene `role === 'system'`.
  - `handles missing credentials and provider failures without writes`: con `isConfigured` a `false`, se rechaza con un texto que contiene `'ANTHROPIC_API_KEY'`. Con `create` rechazando `new ServiceUnavailableException('La clave de Anthropic del servidor no es válida.')`, se rechaza con `'no es válida'`. En ningún caso se llama a `apply`.
  - `expect(global.fetch).toHaveBeenCalledTimes(1)` pasa a `expect(claude.create).toHaveBeenCalledTimes(1)`.
  - Prueba nueva, `last round disables tools`: con 7 respuestas `tool_use` de `list_professionals` seguidas, la octava llamada lleva `toolChoice: 'none'`.

- [ ] **Paso 2: Ejecutar** `npm test -w @nexoclinic/api -- shift-assistant`. Resultado esperado: FALLA.

- [ ] **Paso 3: Implementar** con el mismo bucle que la Tarea 2: 8 vueltas, `toolChoice: 'none'` en la última y `REFUSAL_ANSWER` sin acción pendiente cuando hay un rechazo.
  - Sin configurar, se lanza el mensaje actual con `ANTHROPIC_API_KEY` en lugar de `OPENAI_API_KEY`.
  - `system` contiene solo las reglas estables. La fecha, el instante, la zona y el profesional seleccionado pasan a un segundo bloque de texto del mensaje final del usuario, que empieza por `Contexto actual:`.
  - Si una respuesta trae más de 20 `tool_use`, se mantiene `BadGatewayException('La IA devolvió demasiadas herramientas en una sola respuesta.')`.
  - En los esquemas, `minItems` y `maxItems` se sustituyen por una comprobación en código: un `changes` vacío o con más de 20 elementos devuelve un `tool_result` con `is_error: true`.
  - Las salidas anticipadas (respuesta directa sin volver a llamar al modelo) se conservan tal cual.

- [ ] **Paso 4: Ejecutar** `npm test -w @nexoclinic/api -- shift-assistant`. Resultado esperado: PASA.

- [ ] **Paso 5: Verificación completa**: `npm run build`, `npm test` y `node --test apps/web/test/*.test.mjs scripts/test-appointment-reminders.mjs`. Resultado esperado: todo pasa. Después, `git grep -nE "OPENAI|api\.openai\.com|en Render" -- apps .env.example README.md docs/navegacion-superior.md` no debe devolver nada.

- [ ] **Paso 6: Prueba real (opcional, gasta crédito y requiere el permiso del usuario)**: con una `ANTHROPIC_API_KEY` válida en `.env`, `npm run dev`, hacer una pregunta en cada asistente y confirmar que el esquema `strict` lo acepta la API (una respuesta 400 que mencione el esquema indica que hay alguna palabra clave no admitida).

- [ ] **Paso 7: Commit**: `git add apps/api/src/scheduling apps/api/test/shift-assistant.spec.ts` y `git commit -m "feat: run shift assistant on Claude Sonnet 5.5"`.
