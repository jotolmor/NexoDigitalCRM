# Agenda de día y semana — diseño corto

**Para qué:** la recepción necesita ver el día y la semana por profesional y por hora, y reservar pulsando un hueco libre, en lugar de buscar en el calendario de meses y en el formulario de «Nueva cita».

**Objetivos**
- Vista **Día**: una columna por profesional, filas de 15 minutos dentro del horario de la clínica. Citas como bloques (paciente y tratamiento); huecos libres pulsables; fuera de turno y ausencias en gris.
- Vista **Semana**: un profesional elegido en un desplegable, una columna por día (lunes a domingo).
- Navegación: anterior, «Hoy», siguiente; cambio Día/Semana.
- Pulsar un hueco libre abre un panel con profesional y hora rellenos; se eligen paciente y tratamiento (solo los que ofrece ese profesional). Si el tratamiento no cabe en el hueco, se avisa y no se reserva.
- Pulsar una cita abre su edición existente.
- La agenda va arriba en «Citas»; el calendario de meses queda debajo y, al pulsar un día, mueve la agenda a ese día.

**Fuera de alcance:** arrastrar citas, el resto de puntos de la revisión de UX, cambios de API o de base de datos.

**Restricciones**
- Solo web (`apps/web`). Datos de `GET /api/dashboard/day?date=YYYY-MM-DD` (horario, citas, ausencias y huecos por profesional, en la zona horaria de la clínica). Reserva con `POST /api/appointments`, que ya impide solapes.
- Respetar la terminología por sector y los sectores sin citas (la sección no existe para ellos).

**Enfoques considerados**
1. **Solo web sobre `/dashboard/day`** (elegido): sin cambios de API; la semana son 7 peticiones del mismo endpoint, aceptable para una clínica.
2. Endpoint nuevo de semana en la API: una sola petición, pero toca API, pruebas y despliegue de los dos servicios sin necesidad ahora.
3. Librería de calendario externa: más funciones (arrastrar), pero añade dependencia y estilo ajeno; descartado por ahora.

**Decisiones del constructor (mías):** rango horario visible = desde el turno más temprano hasta el más tardío del día o la semana (por defecto 08:00–20:00 si no hay turnos); la lógica de rejilla va en un módulo puro probado con `node --test`.
