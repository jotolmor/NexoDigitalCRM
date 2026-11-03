# Resumen de citas por día

La pantalla Resumen utiliza los endpoints autenticados existentes `/dashboard/calendar`
y `/dashboard/day`. No cambia la base de datos, la API ni el sistema de reservas.

Al entrar se selecciona hoy en la zona horaria de la clínica. Al elegir una fecha:

- Las tarjetas muestran pacientes distintos con cita, doctores distintos con cita
  y número de citas de ese día. Una persona con dos citas se cuenta una vez como
  paciente y dos como citas.
- El listado agrupa las citas por doctor e incluye únicamente doctores con citas.
  No muestra el directorio completo, turnos vacíos, ausencias ni huecos libres.
- Los datos se derivan de las citas del endpoint, incluyendo citas vinculadas a
  profesionales que ya no están activos. Se excluyen las citas canceladas; se
  conservan los demás estados (incluidas las realizadas y no asistidas).
- El bocadillo se abre junto al día pulsado, muestra pacientes, tratamiento,
  horario local y estado. Funciona en móvil y permite cerrar con botón, Escape o
  clic fuera. Devuelve el foco al día que lo abrió.
- Un error de red no se presenta como ausencia de citas. Hay estados de carga,
  día vacío y error con posibilidad de reintentar.

Las claves de caché incluyen tenant, clínica y usuario. Se conserva la invalidación
por `calendar` y `calendar-day` al confirmar reservas desde el asistente.

## Verificación

Con Node 24 y las dependencias instaladas:

```sh
node --test apps/web/test/overview-data.test.mjs
npm run build -w @nexoclinic/web
```

Prueba de navegador con Python Playwright y Chromium (API simulada; no accede a
pacientes ni servidores de producción). Con Vite activo en el puerto 5173:

```sh
python3 scripts/test-overview-browser.py
```

Se pueden configurar `NEXO_TEST_URL`, `CHROMIUM_PATH` y `NEXO_TEST_ARTIFACT_DIR`.
La prueba cubre recuentos únicos, exclusión de cancelaciones, horario Madrid,
bocadillo, foco/teclado, estados vacío/error, móvil y cambio de año.
