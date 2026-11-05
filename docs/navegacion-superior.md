# Navegación superior del CRM

El menú lateral se sustituye por ocho tarjetas sobre el contenido, compartidas por las vistas del CRM. La vista inicial sigue siendo Asistente y se conserva la terminología configurada por cada clínica. El logo aparece en la cabecera, junto a una tarjeta de fecha y el cierre de sesión. El nombre de la clínica ya no se muestra como título en Citas ni en la cabecera.

`dashboard-navigation.tsx` contiene las tarjetas y sus iconos SVG locales. `dashboard-navigation.css` aplica bordes finos con degradado en movimiento, un pulso suave en la tarjeta activa, relieve y elevación al pasar el puntero o usar el teclado. Los efectos se resuelven con CSS; no se añade ninguna dependencia. `prefers-reduced-motion` desactiva los bucles y la elevación.

En escritorio las tarjetas forman una fila. En móvil pasan a dos columnas; no se esconden destinos en un carrusel. Los botones indican la sección activa con `aria-current="page"`, tienen foco visible y mantienen la interacción estándar de teclado. Un enlace permite saltar al contenido.

La navegación no altera los contratos de API, la autenticación ni el almacenamiento de conversación del asistente. El campo del asistente recibe un nombre accesible. Las pruebas existentes de registro y resumen ahora localizan el menú por su nombre accesible en lugar de depender del antiguo `aside`.

Verificación con la demo local y respuestas de API de prueba:

```bash
npm run build -w @nexoclinic/web
python scripts/test-navigation-browser.py
python scripts/test-access-browser.py
python scripts/test-overview-browser.py
python scripts/test-appointments-browser.py
```

La prueba de navegación cubre 1440, 1024, 768, 390 y 320 px; ocho destinos, indicador activo, movimiento reducido, foco, borrador e historial del asistente, y cierre de sesión. Las capturas se escriben en `/tmp/nexocrm-navigation/`. No se consultan ni modifican datos de producción.

La fecha de la cabecera usa el día local de la clínica. En Citas refleja el día seleccionado en el calendario, muestra «Día seleccionado» cuando no es hoy y conserva la selección al salir y volver a esa vista. En las demás vistas muestra el día actual. El encabezado anterior con el nombre de la clínica y la fecha duplicada se elimina. En móvil la tarjeta de fecha ocupa una fila propia debajo del logo.

Las antiguas vistas Resumen y Citas se unifican en un único destino «Citas». Primero muestra el calendario y los doctores/pacientes del día; debajo incorpora la reserva manual, disponibilidad, próximas citas, edición, dirección y enlaces de recordatorio y rutas. Crear o cambiar una cita invalida también la consulta del listado diario, además del calendario y las próximas citas. La prueba de integración simula ambas escrituras y verifica el refresco sin tocar datos reales.
