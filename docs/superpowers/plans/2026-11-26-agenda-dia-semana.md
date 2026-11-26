# Agenda de día y semana Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir en «Citas» una agenda de día (columnas por profesional) y de semana (un profesional, columnas por día) con huecos pulsables para reservar y citas pulsables para editar.

**Architecture:** Solo web. Un módulo puro (`agenda-grid.ts`) convierte la respuesta de `GET /dashboard/day` en bloques de rejilla y resuelve fechas y zona horaria; un componente (`day-week-agenda.tsx`) la pinta con CSS grid y abre un panel (`agenda-slot-panel.tsx`) para reservar o editar. Se monta en `main.tsx` encima del calendario de meses y comparte con él la fecha seleccionada.

**Tech Stack:** React 18 + TypeScript + TanStack Query, Vite; pruebas con `node --test` sobre módulos `.ts`.

**Spec:** `docs/superpowers/specs/2026-11-26-agenda-dia-semana-design.md`

## Global Constraints

- Sin cambios de API ni de base de datos. Datos: `GET /dashboard/day?date=YYYY-MM-DD`; reservar: `POST /appointments` `{ patientId, professionalId, serviceId, startsAt, endsAt }` (ISO); editar: `PATCH /appointments/:id/reschedule` `{ startsAt, endsAt, professionalId?, serviceId? }` y `PATCH /appointments/:id/status` `{ status }` con `SCHEDULED|CONFIRMED|CANCELLED|COMPLETED|NO_SHOW`.
- Filas de 15 minutos. Rango visible: del inicio del turno más temprano al fin del más tardío entre los datos mostrados, redondeado a horas; si no hay turnos, 08:00–20:00.
- Las horas se interpretan en la zona horaria de la clínica (`timezone` de la respuesta), no en la del navegador.
- Textos en español; usar `useCustomerText()` para términos de sector («Pacientes», etc.).
- Tras reservar o editar, invalidar `['appointments']`, `['calendar']`, `['calendar-day']`, `['summary']`, `['appointment-availability']`.
- Las consultas de la agenda usan la clave `['calendar-day', 'agenda', date]`.

## Review Focus

- Clínica en zona distinta a la del navegador o día de cambio de hora: la cita reservada a las 09:00 en la agenda debe guardarse a las 09:00 hora de la clínica (test de `clinicTimeToIso` con `Europe/Madrid` en 29-03-2026 y 25-10-2026).
- Tratamiento más largo que el hueco pulsado (p. ej. 60 min en un hueco de 30 min antes de otra cita): avisar y no enviar (test de `slotFits`).
- Cita que empieza o acaba fuera del rango visible (p. ej. 07:30 con turno desde 08:00): el rango se amplía para mostrarla entera (test de `visibleRange`).
- Profesional sin turno ese día o con ausencia todo el día: columna entera gris, sin huecos pulsables (test de `columnBlocks`).
- Semana que cruza mes o año (lunes 28-12-2026): fechas correctas (test de `weekDates`).

---

### Task 1: Lógica pura de la rejilla

**Files:**
- Create: `apps/web/src/agenda-grid.ts`
- Test: `apps/web/test/agenda-grid.test.mjs`

**Interfaces:**
- Produces:
  - `type DayProfessional = { id: string; name: string; specialty?: string; services: { id: string; name: string; durationMinutes: number }[]; schedule: { startMinute: number; endMinute: number }[]; appointments: AgendaAppointment[]; timeOff: { start: string; end: string; reason?: string | null }[]; freeSlots: { startMinute: number; endMinute: number }[] }`
  - `type AgendaAppointment = { id: string; startsAt: string; endsAt: string; start: string; end: string; status: string; patient: { id: string; firstName: string; lastName: string }; service?: { id: string; name: string; durationMinutes: number } | null }`
  - `type DayData = { date: string; timezone: string; professionals: DayProfessional[] }`
  - `type Block = { kind: 'appointment' | 'free' | 'absence' | 'closed'; startMinute: number; endMinute: number; appointment?: AgendaAppointment }`
  - `minuteOf(hhmm: string): number`, `formatMinute(minute: number): string` («HH:MM»)
  - `shiftDate(date: string, days: number): string`, `weekDates(date: string): string[]` (lunes→domingo)
  - `visibleRange(professionals: DayProfessional[]): { startMinute: number; endMinute: number }`
  - `columnBlocks(professional: DayProfessional, range: { startMinute: number; endMinute: number }): Block[]` — cubre todo el rango sin solapes, en orden; los huecos libres van partidos en bloques de 15 min; ausencias y fuera de turno como `absence`/`closed` (contiguos fusionados).
  - `slotFits(professional: DayProfessional, startMinute: number, durationMinutes: number): boolean` — cabe entero dentro de un `freeSlot`.
  - `clinicTimeToIso(date: string, minute: number, timezone: string): string`

- [ ] **Step 1: Write the failing tests** (`node:test`, `assert/strict`, importando `../src/agenda-grid.ts`)
  - `weekDates('2026-11-26')` → `['2026-11-23', …, '2026-11-29']`; `weekDates('2026-12-31')[0] === '2026-12-28'` y `[6] === '2027-01-03'`; `shiftDate('2026-03-01', -1) === '2026-02-28'`.
  - `visibleRange([])` → `{ startMinute: 480, endMinute: 1200 }`; con turno 540–840 y otro 600–1110 → `{ 540, 1140 }`; con turno 480–840 y cita `start: '07:30', end: '08:00'` → `startMinute: 450`→ redondeado a `420`.
  - `columnBlocks` de profesional con turno 540–660, cita 570–600 y `freeSlots` [540–570, 600–660], rango 480–720 → kinds en orden: `closed 480–540`, `free 540–555`, `free 555–570`, `appointment 570–600`, `free 600–615` … `free 645–660`, `closed 660–720`.
  - `columnBlocks` sin turno → un único `closed` 480–720; con `timeOff` `09:00–11:00` sobre turno 540–660 y sin `freeSlots` → `absence 540–660` entre dos `closed`.
  - `slotFits(p, 540, 30) === true`, `slotFits(p, 555, 30) === false` (choca con la cita de 570), `slotFits(p, 600, 60) === true`, `slotFits(p, 630, 60) === false`.
  - `clinicTimeToIso('2026-11-27', 540, 'Europe/Madrid') === '2026-11-27T08:00:00.000Z'`; `('2026-07-01', 540, 'Europe/Madrid') === '2026-07-01T07:00:00.000Z'`; `('2026-03-29', 600, 'Europe/Madrid') === '2026-03-29T08:00:00.000Z'`; `('2026-11-27', 540, 'America/New_York') === '2026-11-27T14:00:00.000Z'`.
- [ ] **Step 2: Run** `node --test apps/web/test/agenda-grid.test.mjs` — Expected: FAIL (module not found).
- [ ] **Step 3: Implement `agenda-grid.ts`.** Fechas con `Date.UTC` sobre `YYYY-MM-DD` (nunca hora local). `clinicTimeToIso`: tomar el instante UTC ingenuo, calcular el desfase de la zona con `Intl.DateTimeFormat(..., { timeZone, hourCycle: 'h23', year…second })` en ese instante, restarlo, y repetir una vez con el instante corregido (para cambios de hora).
- [ ] **Step 4: Run** `node --test apps/web/test/*.test.mjs` — Expected: todas PASS (incluidas las 9 existentes).
- [ ] **Step 5: Commit** `feat: agenda grid helpers`

### Task 2: Panel de reserva y edición

**Files:**
- Create: `apps/web/src/agenda-slot-panel.tsx`

**Interfaces:**
- Consumes: `DayProfessional`, `AgendaAppointment`, `slotFits`, `clinicTimeToIso`, `formatMinute`, `minuteOf` (Task 1).
- Produces:
  - `type PanelTarget = { kind: 'slot'; date: string; startMinute: number; professional: DayProfessional } | { kind: 'appointment'; date: string; professional: DayProfessional; appointment: AgendaAppointment }`
  - `AgendaSlotPanel(props: { target: PanelTarget; timezone: string; patients: { id: string; firstName: string; lastName: string }[]; write: (path: string, body: unknown, method?: 'PATCH') => Promise<any>; onDone: () => void; onClose: () => void })`

- [ ] **Step 1: Implementar el modo `slot`:** `<aside role="dialog" aria-label="Reservar cita">` con título «Nueva cita · {profesional} · {día} {HH:MM}», selector de paciente (orden alfabético por apellido), selector de tratamiento con solo `professional.services` («Nombre · N min»), botón «Reservar cita» y «Cerrar». Al enviar: si `!slotFits(...)` mostrar «El tratamiento dura N min y no cabe en este hueco.» y no llamar a la API; si cabe, `write('/appointments', { patientId, professionalId, serviceId, startsAt: clinicTimeToIso(date, startMinute, timezone), endsAt: clinicTimeToIso(date, startMinute + duración, timezone) })`, luego `onDone()`. Errores de la API en `<p className="error" role="alert">`.
- [ ] **Step 2: Implementar el modo `appointment`:** título con paciente y «HH:MM–HH:MM», tratamiento y estado actual; selector de estado (Programada, Confirmada, Realizada, No asistió, Cancelada) que hace `PATCH /appointments/:id/status`; formulario «Cambiar hora» con fecha (`date`), hora (`time`, paso 900 s) y tratamiento → `PATCH /appointments/:id/reschedule` con `startsAt`/`endsAt` calculados con `clinicTimeToIso` y `serviceId`. Ambos llaman `onDone()`. Escape y «Cerrar» llaman `onClose()`.
- [ ] **Step 3: Verificar** `npm run build -w apps/web` — Expected: compila sin errores de tipos.
- [ ] **Step 4: Commit** `feat: agenda booking and edit panel`

### Task 3: Agenda de día y semana y montaje en «Citas»

**Files:**
- Create: `apps/web/src/day-week-agenda.tsx`, `apps/web/src/day-week-agenda.css`
- Modify: `apps/web/src/main.tsx` (rama `activeSection === 'Citas'` del `Dashboard`)

**Interfaces:**
- Consumes: Task 1 (`DayData`, `visibleRange`, `columnBlocks`, `weekDates`, `shiftDate`, `formatMinute`), Task 2 (`AgendaSlotPanel`, `PanelTarget`).
- Produces: `DayWeekAgenda(props: { scope: string[]; date: string; today: string; onDateChange: (date: string) => void; load: (path: string) => Promise<any>; write: (path: string, body: unknown, method?: 'PATCH') => Promise<any> })`

- [ ] **Step 1: Implementar `DayWeekAgenda`.** Cabecera: «‹», «Hoy», «›» (±1 día en Día, ±7 en Semana), fecha larga en español, conmutador «Día | Semana» (`aria-pressed`) y, en Semana, selector de profesional (por defecto el primero). Datos: Día = una consulta de `date`; Semana = `useQueries` de los 7 `weekDates(date)`, todas con clave `['calendar-day', 'agenda', d]` y `load('/dashboard/day?date=' + d)`. Pacientes con `useQuery(['patients-agenda'], () => load('/patients'))`.
- [ ] **Step 2: Rejilla.** Contenedor `display:grid` con columna de horas + una por profesional (Día) o por día (Semana); `grid-template-rows: repeat(N, 28px)` con N = (fin−inicio)/15; cada bloque con `grid-row: (start−inicio)/15+1 / span (fin−start)/15`. `free` = `<button>` con `aria-label="Reservar {HH:MM} con {profesional}"`; `appointment` = `<button>` con paciente, tratamiento y hora, color por estado; `closed`/`absence` = `<div>` gris (`absence` con rayado y `title` del motivo). Etiquetas de hora cada 60 min. Cabeceras de columna fijas al hacer scroll (`position: sticky`); en Semana se resalta `today`. Ancho mínimo de columna 140 px con scroll horizontal dentro del panel (nunca de la página). Estados: cargando («Cargando agenda…»), error (`role="alert"`), sin profesionales («No hay profesionales activos.»).
- [ ] **Step 3: Panel.** Pulsar bloque abre `AgendaSlotPanel` con su `PanelTarget`; `onDone` invalida las claves de Global Constraints y cierra.
- [ ] **Step 4: Montaje en `main.tsx`:** en la rama de Citas, pasar como `calendar` `<><DayWeekAgenda scope={[session.user.tenantId, session.user.clinicId ?? '', session.user.id]} date={overviewDate} today={today} onDateChange={setSelectedDate} load={…} write={…} /><AppointmentOverview … /></>`, de modo que pulsar un día del calendario mueve la agenda y viceversa.
- [ ] **Step 5: Verificar** `npm run build` y `node --test apps/web/test/*.test.mjs scripts/test-appointment-reminders.mjs` — Expected: compila; todas PASS. `npm test` — Expected: 146 PASS (API sin cambios).
- [ ] **Step 6: Commit** `feat: day and week agenda in Citas`
