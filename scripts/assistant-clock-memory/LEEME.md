# Corrección de hora y memoria de NexoCRM

Este paquete se aplica sobre el código del VPS y conserva las correcciones anteriores
(fecha actual, consulta diaria, búsqueda de personas y ocho rondas). Comprueba todos
los puntos de inserción antes de escribir y respalda los dos archivos que modifica.
No modifica datos ni estructura de PostgreSQL, claves, Docker Compose ni credenciales.

## Cambios

- Las citas devueltas a OpenAI incluyen localStart, localEnd y la zona real de la clínica.
- Los ISO incluyen el desplazamiento +01:00/+02:00 y representan el mismo instante
  guardado. Los resúmenes de cambios y cancelaciones usan horario de la clínica.
- La búsqueda de citas admite nombre completo mediante el filtro ya existente en el VPS.
- El chat conserva hasta 40 mensajes y el borrador durante la navegación y recarga de
  la misma pestaña. El estado se separa por usuario, clínica y tenant y se limpia al
  cerrar sesión o caducar la autenticación.
- Las respuestas en curso pueden terminar aunque se cambie de sección.
- Una acción pendiente se mantiene al navegar; tras recargar debe volver a prepararse.
  Nunca se confirma ni se ejecuta automáticamente.
- Se añade el botón Nueva conversación.

Esto es continuidad de sesión en el navegador, no un archivo histórico permanente
  en PostgreSQL ni sincronización entre ordenadores. Cerrar la pestaña termina esta
  memoria de sesión según el comportamiento de sessionStorage del navegador.

## Aplicación desde SSH del VPS

Extraer ZIP en /opt/nexocrm-fix y ejecutar:

    python3 /opt/nexocrm-fix/apply-fix.py

Si el script no reconoce el código, se detiene sin escribir los archivos fuente.
No volver a ejecutarlo tras aplicarlo: detecta la corrección existente.

Después:

    cd /opt/nexocrm-deploy
    docker compose -f docker-compose.yml -f api.yml -f web.yml -f public.yml build api web

Solo si la compilación termina correctamente:

    docker compose -f docker-compose.yml -f api.yml -f web.yml -f public.yml up -d --no-deps api web

Esperar al arranque y comprobar:

    curl -i http://127.0.0.1:8082/api/health/ready

## Comprobación de la cita (solo lectura)

    cd /opt/nexocrm-deploy
    docker compose -f docker-compose.yml -f api.yml -f web.yml -f public.yml exec -T db psql -U nexocrm -d nexocrm < /opt/nexocrm-fix/comprobar-hora.sql

Si UTC=16:00 y hora_local_clinica=17:00, la cita está guardada a las 17:00 de Madrid.
No sumar una hora a las filas ni modificar startsAt/endsAt para corregir presentación.
Si la hora local de la fila es 16:00, contrastar con el resumen confirmado antes de
realizar cualquier cambio de reserva: este paquete no reescribe citas.

## Pruebas posteriores

1. Ctrl+F5 en NexoCRM. Nueva conversación para descartar respuestas antiguas.
2. Buscar las citas de Candela Soto por fecha y contrastar con SQL/agenda.
3. Escribir una consulta y un borrador; ir a Pacientes y volver a Horarios.
4. Recargar la misma pestaña, volver a Horarios y comprobar continuidad.
5. Cerrar sesión y verificar que el siguiente usuario no recibe el historial.
6. Preparar sin confirmar una acción; navegar no debe crear citas.

## Validación realizada antes de entregar

- Compilación API y frontend (TypeScript/Vite).
- Pruebas existentes del repositorio: 2 suites, 4 pruebas correctas.
- Conversión de invierno, verano y horas repetidas/inexistentes de marzo/octubre.
- Se conservan los instantes ISO y duración de la cita, y el aislamiento tenant/clínica.
- Playwright sobre la aplicación React con API simulada: navegación, recarga,
  borrador, respuesta durante navegación, acción pendiente sin auto-confirmación,
  separación por cuenta/clínica y borrado al cerrar sesión.
- Compatibilidad de las inserciones con la estructura de las correcciones del VPS.

No se ha ejecutado en el VPS ni se ha llamado a OpenAI con datos reales durante estas pruebas.

## Página independiente del asistente

Después de aplicar la corrección de memoria, `move-assistant-page.py` mueve el chat
existente a Asistente, primera opción y vista inicial del menú. Extrae el mismo
componente y sus manejadores: no cambia la API ni los datos o las confirmaciones.
Crea respaldo del frontend y se detiene si no reconoce la versión esperada.
Compilar y actualizar solo el servicio web después de aplicarlo.

Validado con TypeScript/Vite y Playwright: primera opción y pantalla inicial,
asistente ausente en Horarios, formulario de horarios conservado, historial y
borrador al navegar/recargar, respuestas en curso y confirmación pendiente.
