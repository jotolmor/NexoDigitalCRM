# NexoCRM → n8n → SMS, WhatsApp y llamadas

El diseño de la web permanece finalizado. Esta integración añade API, cola y un flujo de n8n que se importa **inactivo**. Todavía hay que configurar n8n y contratar/configurar el proveedor; este repositorio no crea cuentas ni envía mensajes durante sus pruebas.

## Arquitectura

n8n consulta al CRM cada minuto mediante HTTPS con una clave propia por clínica. No se necesita publicar un webhook de n8n ni quitar Cloudflare Access de su panel. La clave de automatización sólo autentica los endpoints de trabajos; no permite usar los endpoints de pacientes o citas con JWT. Se almacena su hash en PostgreSQL y el propietario puede rotarla o desactivarla.

Los eventos de alta, cambio de fecha y cambio de estado de una cita se escriben junto con la cita en una transacción. Los cambios de fecha y los estados que invalidan avisos incrementan su versión. Confirmar una reserva existente no repite su recordatorio. Los trabajos validan la versión, teléfono, estado y fecha actuales antes de enviarse. Se preparan confirmaciones, recordatorios, cambios y cancelaciones; no se envían avisos operativos de citas pasadas o completadas.

Los recordatorios se generan en tres etapas: 72 horas, 24 horas y 1 hora antes de cada cita. `reminderOffsetsMinutes` permite configurar las etapas (minutos, entre 60 y 4320). Cada etapa se deduplica por cita, versión, canal, modo y teléfono. El sondeo cada minuto permite hasta un minuto de demora en el último aviso; después se descarta. Una cita cancelada, reprogramada o con teléfono modificado invalida el trabajo antiguo. Si el sistema se conecta tarde, se ofrece solo la etapa vigente, nunca varios avisos atrasados juntos. Al conectar por primera vez, los eventos históricos anteriores a la conexión no se reproducen; sí se revisan los próximos recordatorios. En una primera conexión dentro de esa ventana puede generarse un recordatorio inmediatamente. Prueba primero el volumen en DRY_RUN.

Los canales se eligen por clínica: `WHATSAPP`, `SMS`, `CALL`. Cada canal seleccionado recibe su propio trabajo. El valor inicial es sólo WhatsApp; el script permite simular los tres antes de decidir qué canales activar realmente. No hay sustitución automática entre canales ni reintentos de envío externos.

## Desplegar y crear la conexión

Ejecuta en el VPS el script de despliegue de la versión indicada por Codex. Hace copia de fuentes y PostgreSQL, compila y aplica la migración aditiva; sólo recrea la API. Conserva los archivos personalizados del asistente y la configuración Compose.

Después:

```bash
python3 /opt/nexocrm/scripts/setup-n8n-connection.py --channels WHATSAPP,SMS,CALL
```

Introduce las credenciales del propietario **en el servidor**. El script no muestra la contraseña ni la clave generada, configura DRY_RUN y guarda la credencial en `/root/.config/nexocrm/n8n-credential.json` con permisos 600. La carpeta tiene permisos 700. Este archivo no se sube a GitHub. No pegues su contenido en el chat. Si ya hay conexión, `--rotate` permite sustituir su clave y obliga a actualizar la credencial de n8n.

## Importar en n8n

1. Entra en `https://n8n.nexodigitaldesing.com` usando tu acceso de Cloudflare y tu usuario de n8n.
2. Importa `nexocrm-notifications.json` mediante **Import from File**. El flujo queda inactivo.
3. Crea una credencial **Header Auth**, con nombre `NexoCRM - Authorization`, cabecera `Authorization` y el valor `Bearer ...` del archivo privado guardado en el servidor.
4. Asigna esa misma credencial a todos los nodos HTTP del CRM: Recoger trabajos, Validar cita, Registrar simulacion, Registrar fallo y los tres nodos Registrar SMS/WhatsApp/llamada.
5. Revisa el nodo Configuracion. La URL por defecto apunta a `https://nexocrm.nexodigitaldesing.com/api/automations/n8n`.
6. Ejecuta manualmente el flujo. Con DRY_RUN, los trabajos se marcan SIMULATED y **no se ejecutan los nodos del proveedor**.
7. Revisa las ejecuciones y el estado de conexión antes de activar el disparador periódico. La configuración del flujo evita guardar los datos completos de ejecuciones correctas y fallidas; no habilites su almacenamiento para depurar con datos reales.

Para descargar el JSON desde PowerShell, después del despliegue:

```powershell
scp root@82.165.104.229:/opt/nexocrm/integrations/n8n/nexocrm-notifications.json "$env:USERPROFILE\Downloads\nexocrm-notifications.json"
```

## Proveedor preparado: Twilio

Es un adaptador preparado, no una cuenta contratada. Se pueden sustituir los tres nodos HTTP si eliges otro proveedor.

Para SMS y llamadas necesitas una cuenta con capacidad de envío y números habilitados para esos servicios. Para WhatsApp necesitas además un remitente habilitado y plantillas aprobadas. En pruebas del proveedor puede ser necesario verificar previamente el número de destino; consulta las condiciones de tu cuenta.

- Crea en n8n una credencial **HTTP Basic Auth**: usuario = Account SID, contraseña = Auth Token. Selecciónala en Enviar SMS, Enviar WhatsApp y Enviar llamada.
- En Configuracion, introduce Account SID y los números de origen (`smsFrom`, `voiceFrom`, `whatsappFrom`). WhatsApp utiliza `whatsapp:+...`.
- Configura las cinco referencias de plantilla de WhatsApp (`HX...`) para alta, confirmación, recordatorio, cambio y cancelación. Las variables son `1` = nombre, `2` = fecha/hora local, `3` = nombre de clínica. El aviso no incluye DNI ni tratamiento.
- Las llamadas usan un mensaje de voz en español con la información operativa de la cita. No es un agente telefónico conversacional ni registra respuestas habladas.
- Los nodos comprueban que haya SID, remitente y plantilla con formato válido antes de contactar con el proveedor. No guardes Auth Token en el nodo Configuracion: va en la credencial de n8n.

El modo LIVE se activa mediante `PATCH /api/automations/n8n/connection`, autenticado como propietario, **después** de configurar el proveedor y acordar los destinatarios/canales de prueba. El script de preparación no activa LIVE. Los trabajos creados en DRY_RUN conservan su modo y no se convierten en envíos reales. Al activar LIVE explícitamente se preparan trabajos de recordatorio reales para las citas próximas dentro de la ventana configurada; los eventos históricos ya simulados no se reproducen.

## Seguimiento y recuperación

- PENDING: preparado; PROCESSING: cedido a una ejecución de n8n.
- SIMULATED: prueba sin contacto externo.
- SENT: el proveedor aceptó la petición y devolvió un identificador. **No acredita entrega final, lectura de WhatsApp ni llamada atendida.** Los webhooks de estado final del proveedor quedan pendientes para la siguiente fase.
- FAILED: teléfono inválido, rechazo del proveedor o trabajo interrumpido. No se reenvía automáticamente.
- CANCELLED: la cita cambió, se canceló o se pausó el canal antes del envío.

Los trabajos se deduplican y se ceden de manera condicional para que dos ejecuciones no reclamen el mismo PENDING. Un trabajo sin resultado durante 30 minutos pasa a FAILED con `delivery_uncertain_review_required`: comprueba primero el panel del proveedor antes de ordenar un nuevo envío. Una interrupción de red después de aceptar el proveedor una petición no permite garantizar exactamente una entrega; no se fuerza un reintento que pudiera duplicarla.

La versión se comprueba justo antes del nodo externo. Una modificación durante los milisegundos entre validación y aceptación del proveedor aún podría coincidir con el envío; no se promete revocar un mensaje que el proveedor ya aceptó.

## API

Propietario con JWT:

- POST `/api/automations/n8n/connection`: crear clave, una vez.
- GET `/api/automations/n8n/connection`: configuración y recuentos, sin secretos.
- PATCH `/api/automations/n8n/connection`: enabled, mode, channels y reminderOffsetsMinutes (por defecto `[4320,1440,60]`). `reminderMinutes` se conserva como ajuste heredado, pero las conexiones actuales usan las etapas.
- POST `/api/automations/n8n/rotate-key`: sustituir la clave.

n8n con clave dedicada:

- POST `/api/automations/n8n/jobs/claim` con `{ "limit": 10 }`.
- POST `/api/automations/n8n/jobs/:id/validate` con deliveryToken.
- POST `/api/automations/n8n/jobs/:id/result` con deliveryToken, status y providerMessageId cuando el proveedor acepta un envío real.

La clave determina el tenant y la clínica. El cuerpo no admite seleccionar otros tenants o clínicas. Cada trabajo lleva además un token de entrega propio, almacenado como hash y verificado al validar o registrar su resultado.

## Verificación local

```bash
npm run prisma:generate -w @nexoclinic/api
npm run build -w @nexoclinic/api
npm run test -w @nexoclinic/api -- --runTestsByPath test/n8n-automations.spec.ts test/appointment-events.spec.ts
python3 scripts/build-n8n-workflow.py
```

Las pruebas utilizan Prisma y proveedor simulados; no crean conexiones en el n8n de producción, no han aplicado su migración y no han enviado mensajes ni llamadas. La importación/ejecución en tu versión concreta de n8n sigue siendo una comprobación pendiente en el servidor.

## De prueba individual a todos los pacientes

La planificación del CRM incluye a todos los pacientes de la clínica autenticada con citas programadas o confirmadas y teléfono válido. Los botones de Próximas citas preparan mensajes manuales por WhatsApp/SMS; no registran un envío automático ni omiten otros pacientes.

La configuración del servidor se conserva durante esta actualización: no se activa LIVE ni se cambian canales. Si el workflow instalado contiene el filtro `Solo prueba Jorge`, ese filtro sigue restringiendo los envíos reales. Después de preparar los canales de producción, retira únicamente ese filtro y conecta la salida false de `Es simulacion` a `Canal SMS`, conservando la validación y las demás comprobaciones. No dupliques el flujo de sondeo.

El Sandbox WhatsApp solo entrega a participantes unidos durante las últimas 72 horas. Para avisar a todos los pacientes se necesita un remitente de producción y una plantilla aprobada. La plantilla Sandbox usada en pruebas es inglesa y solo admite fecha y hora; no basta para el texto personalizado español del CRM. Para el texto completo, crea una plantilla de recordatorio con variables `1` nombre, `2` fecha/hora local, `3` clínica y texto de contacto si no puede asistir; asigna su Content SID y usa `JSON.stringify($('Separar trabajos').item.json.variables)` como ContentVariables. El saludo de las plantillas debe ser fijo, por ejemplo «Hola», a menos que se apruebe una variable adicional. SMS y voz usan el texto personalizado con saludo local del CRM. Las cuentas de prueba SMS/voz están limitadas a destinatarios verificados.

Antes de activar LIVE, comprueba el volumen por clínica, los canales seleccionados y los avisos en DRY_RUN. Activar dos canales genera un recordatorio por canal en cada etapa. Los trabajos antiguos sin etapa se descartan; no se reenvían ni se convierten automáticamente los simulados.
