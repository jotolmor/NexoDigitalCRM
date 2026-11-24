# Navegación superior del CRM

El menú lateral se sustituye por ocho tarjetas sobre el contenido, compartidas por las vistas del CRM. La vista inicial sigue siendo Asistente y se conserva la terminología configurada por cada clínica. El logo aparece en la cabecera, junto a las tarjetas de fecha y ubicación y el cierre de sesión. El nombre de la clínica ya no se muestra como título en Citas ni en la cabecera.

`dashboard-navigation.tsx` contiene las tarjetas y sus iconos SVG locales. `dashboard-navigation.css` aplica bordes finos con degradado en movimiento, un pulso suave en la tarjeta activa, una sombra pequeña difuminada, sin relieve ni desplazamiento al pasar el puntero o usar el teclado. Los efectos se resuelven con CSS; no se añade ninguna dependencia. `prefers-reduced-motion` desactiva los bucles.

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

Las antiguas vistas Resumen y Citas se unifican en un único destino «Citas». Primero muestra el formulario Nuevo paciente en horizontal, disponible únicamente en Citas, y después Nueva cita a todo el ancho, con cuatro campos en fila en escritorio y adaptación a dos o una columna. Debajo muestra el calendario, los doctores/pacientes del día y las próximas citas, con edición y enlaces de recordatorio y rutas. Crear o cambiar una cita invalida también la consulta del listado diario, además del calendario y las próximas citas. La prueba de integración simula ambas escrituras y verifica el refresco sin tocar datos reales.

La dirección se recoge en el registro (hasta 300 caracteres) y se guarda en el campo `Clinic.address` existente. El DTO de registro admite también clientes antiguos que no envíen la dirección; no se cambia el esquema ni se requiere una migración. La tarjeta Ubicación de la cabecera permite añadir o editar la dirección de cuentas existentes mediante el endpoint autenticado `PATCH /clinic/me`, conservando sus permisos y aislamiento por clínica. Al guardarla se actualizan las consultas de la cabecera y de las citas, de modo que las rutas y los textos de recordatorio usan la dirección actual. El formulario de dirección se retira del listado de citas.

Además de las pruebas de navegador se verifica la validación del DTO y el envío de la dirección a Prisma dentro de la transacción de registro:

```bash
npm run test -w @nexoclinic/api -- --runTestsByPath test/auth-address.spec.ts
```

La sección Doctores y pacientes del día usa tarjetas verticales en una retícula adaptable, con borde degradado índigo/turquesa, sombra pequeña difuminada, iniciales, nombre, contexto, número de citas y el primer horario del día. El botón de detalles queda al pie de cada tarjeta y las tarjetas se apilan en móvil. Cada persona aparece una sola vez por su ID, incluso si tiene varias citas o comparte nombre con otra. Los pacientes se agrupan también cuando tienen citas con varios profesionales. Se conservan únicamente las citas no canceladas.

El botón «Detalles de citas» abre un bocadillo anclado a la tarjeta, filtrado por profesional o paciente y por el día ya consultado. El calendario mantiene su bocadillo general, sin abrir modales anidados. Los detalles muestran tratamientos, horarios en la zona de la clínica, estados y personas relacionadas, usando los datos de la consulta diaria existente. Escape, botón de cierre y fondo devuelven el foco al botón que abrió el bocadillo; la posición y el contenido desplazable se adaptan al viewport. Las tarjetas no se inclinan ni se elevan al interactuar.

La agrupación de pacientes y la separación por ID se verifican con:

```bash
node --test apps/web/test/overview-data.test.mjs
```

La prueba de navegador del calendario cubre también detalles de cada tipo de tarjeta, filtrado por persona, cancelaciones, teclado y límites del bocadillo en móvil.

Próximas citas utiliza también tarjetas verticales en una retícula adaptable, con borde degradado y sombra pequeña difuminada a juego con doctores y pacientes. Conserva los botones de edición, recordatorios y rutas. El formulario de edición se adapta al ancho de cada tarjeta sin inclinación ni elevación.

El formulario compartido `patient-create-form.tsx` incluye nombre, apellidos, nacimiento, edad, correo, teléfono, dirección, código postal, localidad y provincia. En Citas se sitúa sobre Agenda/Nueva cita, con filas horizontales en escritorio y adaptación progresiva a tres, dos y una columna. Tras guardar, invalida los listados de pacientes y selecciona al nuevo paciente en el formulario de reserva. Los errores conservan los datos introducidos; el botón se desactiva durante el envío. La página Pacientes no incluye el formulario de alta: muestra únicamente el listado de fichas verticales, con iniciales, nombre, edad, contacto, dirección y botón de edición. En móvil se apilan en una columna.

```bash
python scripts/test-patient-create-browser.py
```

La prueba cubre ubicación y disposición horizontal, campos obligatorios, error y reintento, normalización del envío, selección automática, contactos opcionales, actualización y edición desde las fichas de Pacientes, ausencia de formulario de alta en esa página y móvil. No realiza altas reales.

El alta y la edición incluyen código postal (texto, conservando ceros iniciales), localidad (el campo `city` ya existente), provincia, edad opcional y fecha de nacimiento opcional. Si se introduce nacimiento, la edad deja de ser editable y se calcula; el servidor deriva la edad usando el día local de la clínica y la vuelve a calcular al consultar pacientes. La fecha se almacena como DATE, sin hora. Si sólo se conoce la edad se guarda como entero entre 0 y 130, incluyendo cero para menores de un año. Los clientes antiguos pueden omitir todos los campos nuevos.

La migración `20261105120000_patient_details` añade cuatro columnas opcionales y una restricción de rango para edad; no elimina ni modifica las columnas anteriores. Antes de usar la nueva API hay que aplicar la migración. El script `scripts/deploy-patient-details.sh SHA` está preparado para el VPS existente: extrae únicamente los archivos necesarios, conserva una copia de fuentes, compila API/web, hace un pg_dump, ejecuta `prisma migrate deploy` y recrea sólo API/web. No toca los archivos personalizados del asistente ni reemplaza la configuración Compose.

```bash
npm run test -w @nexoclinic/api -- --runTestsByPath test/patient-demographics.spec.ts
python scripts/test-patient-create-browser.py
```

Las pruebas cubren validación, guardado de los nuevos campos, código postal con ceros, compatibilidad de registros sin datos nuevos, edición y limpieza de campos opcionales, cumpleaños, fecha futura, día local de la clínica y cálculo de edad en el navegador. La migración se aplica en el VPS mediante el script; no se ha ejecutado contra la base de datos de producción desde este entorno.

`flat-cards.css` aplica el acabado común de borde degradado fino y sombra difuminada a las tarjetas, paneles y formularios del CRM, incluidos los bocadillos. El menú conserva su borde animado y estado activo; se eliminan sus aristas duras y su elevación. Las tarjetas de acceso conservan la animación del borde con una sombra suave. Las pruebas de navegador verifican que pacientes, menú, citas y personas del día no tengan transformación al pasar el cursor.

El acabado común refuerza el degradado índigo/turquesa de los bordes y utiliza una sombra oscura difuminada en dos capas. El fondo del CRM combina tonos más oscuros de pizarra azulada, índigo y turquesa, con la cabecera diferenciada y superficies blancas para tarjetas y formularios. Los formularios de edición comparten este acabado, conservando su distribución adaptable.


El directorio de Profesionales tiene el alta horizontal (cuatro columnas, dos y una según el ancho) y fichas verticales con iniciales, especialidad, contacto y edición. El selector Profesión filtra el combo Especialidad; al cambiar de profesión se limpia la especialidad anterior. El catálogo clínico agrupa odontología, medicina, enfermería, fisioterapia, psicología, nutrición, higiene y otras profesiones sanitarias. Otros sectores utilizan su catálogo de actividades. Se puede indicar otra especialidad y se conservan los valores personalizados existentes. Profesión guía la selección; el contrato existente sigue guardando `specialty`, sin columnas nuevas ni migración.

`edit-popover.tsx` utiliza un diálogo nativo centrado para todas las ediciones: pacientes, profesionales, servicios, citas, tratamientos, seguimientos, turnos y ubicación. Conserva los formularios, validaciones y endpoints existentes; los errores permanecen dentro del diálogo. El fondo queda inactivo, el foco se mantiene dentro del bocadillo, Escape/cerrar/fondo permiten cancelar y el foco vuelve al elemento de apertura. En móvil el contenido puede desplazarse sin salir del viewport. La ubicación bloquea el cierre mientras guarda. `professional-edit.css` reúne el diseño del directorio, los diálogos y los tonos oscuros de botones, manteniendo los estados activos, desactivados y el foco visible.

```bash
python scripts/test-professional-edit-browser.py
python scripts/test-patient-create-browser.py
python scripts/test-appointments-browser.py
python scripts/test-navigation-browser.py
```

Las pruebas con API simulada cubren las especialidades dependientes, alta y edición profesional, especialidades antiguas, error/reintento, todos los tipos de edición, teclado, cierre y móvil. No modifican datos reales.


Servicios utiliza también un formulario horizontal y un listado de tarjetas verticales. El alta permite elegir profesión y especialidad dependiente, duración, precio y descripción. Profesión/especialidad se guardan en el servicio y se muestran en la ficha. Los servicios antiguos se pueden editar sin clasificación; en edición se puede conservar, cambiar o eliminar la clasificación. Las especialidades personalizadas se mantienen. Los editores centrados y tonos de botones del resto del sitio se conservan.

La migración `20261105170000_service_specialties` añade `Service.profession` y `Service.specialty` como texto opcional, sin modificar registros existentes. Los DTOs admiten clientes antiguos, rechazan tipos o longitudes incorrectos y permiten limpiar campos con null. La actualización conserva el aislamiento por tenant/clínica. `scripts/deploy-service-specialties.sh SHA` prepara copia de fuentes y base de datos, compila, aplica las migraciones y recrea API/web con los cuatro archivos Compose. No sustituye los archivos personalizados del asistente. La migración de producción debe ejecutarse en el VPS; no se ha aplicado desde este entorno.

```bash
npm run test -w @nexoclinic/api -- --runTestsByPath test/service-specialties.spec.ts
python scripts/test-service-directory-browser.py
python scripts/test-professional-edit-browser.py
```

Se comprueban clasificación y persistencia, especialidades dependientes, selección de duración, error/reintento, edición personalizada, limpieza de clasificación, compatibilidad de servicios antiguos, tarjetas verticales y editor centrado en móvil. Las pruebas utilizan datos simulados.

Duración de tratamientos presenta una retícula adaptable de tarjetas verticales, con icono de reloj, nombre, precio, descripción, selector de duración y los dos botones apilados a todo el ancho. Comparte borde degradado, sombra difuminada y botones oscuros con los directorios. En móvil se apila en una columna; se conserva el editor centrado y el guardado de duración existente.


Seguimiento muestra ahora una búsqueda horizontal con únicamente nombre del paciente, DNI y teléfono. Se exige al menos un criterio; los criterios se combinan y el nombre completo se separa en palabras que pueden aparecer en nombre o apellidos. El endpoint de pacientes mantiene la búsqueda general `search` anterior y admite `name`, `dni`, `phone`, con validación de longitudes y aislamiento por clínica. Los teléfonos se comparan por dígitos para admitir espacios, guiones y paréntesis en registros antiguos. Los resultados aparecen en un único bocadillo central, con estados de carga, error, reintento y sin coincidencias. Las tarjetas de pacientes del listado y los resultados son verticales. Desde cada tarjeta se consulta, edita o completa el seguimiento ya existente, sin diálogos anidados. Se retira el formulario anterior de creación de tareas; los registros previos y sus endpoints se conservan.

El alta compartida de nuevo cliente/paciente y la edición incorporan DNI opcional (también permite NIE). Se normaliza a mayúsculas sin espacios, puntos o guiones, se valida como identificador alfanumérico de 3 a 20 caracteres y se muestra en su ficha. No se comprueba el dígito de control ni se integra un sistema de facturación: el identificador queda disponible en los datos del cliente. El campo es opcional para conservar compatibilidad con pacientes antiguos. La migración `20261105180000_patient_dni` añade únicamente `Patient.dni`, sin borrar datos.

`scripts/deploy-patient-search.sh SHA` conserva una copia de fuentes y base de datos, compila API/web, aplica las migraciones pendientes y recrea los servicios. Incluye las migraciones opcionales anteriores para mantener coherencia del esquema y las fuentes necesarias para los cambios recientes del directorio. No sustituye los archivos personalizados del asistente ni la configuración Compose. No se ha ejecutado la migración de producción desde este entorno.

```bash
npm run test -w @nexoclinic/api -- --runTestsByPath test/patient-search.spec.ts test/patient-demographics.spec.ts
python scripts/test-patient-followup-search-browser.py
python scripts/test-patient-create-browser.py
python scripts/test-professional-edit-browser.py
```

Se comprueban guardado, normalización y limpieza de DNI, compatibilidad de pacientes antiguos, filtros combinados y alcance de clínica, teléfonos con formato, resultados centrales y fichas verticales, edición/completado de seguimientos existentes, error/reintento y móvil. Las pruebas no consultan ni modifican datos reales.

El alta y la edición de profesionales incluyen DNI y NIF como campos opcionales, con normalización a mayúsculas sin espacios, puntos ni guiones. Se guardan por separado y se muestran en la tarjeta; se pueden modificar o limpiar sin afectar a los datos anteriores. La API admite entre 3 y 20 caracteres alfanuméricos normalizados y conserva compatibilidad con clientes antiguos. La migración `20261105190000_professional_identifiers` añade ambas columnas opcionales, sin eliminar datos. El despliegue preparado en `scripts/deploy-professional-identifiers.sh SHA` guarda copias y aplica las migraciones antes de recrear API/web; no se ha ejecutado contra producción desde este entorno. Validación: `test/professional-identifiers.spec.ts` y `scripts/test-professional-edit-browser.py`, con datos simulados.

La búsqueda de Seguimiento separa Nombre y Apellidos. Los cuatro campos (nombre, apellidos, DNI, teléfono) son independientes y basta uno para buscar, incluidos sólo apellidos o sólo DNI. La API añade `firstName` y `lastName` como filtros opcionales separados, conservando `name` y `search` para clientes anteriores. Los apellidos compuestos se separan en palabras y se comparan únicamente con `lastName`, sin distinguir mayúsculas/minúsculas. No requiere migración.


## Turnos de profesionales

El destino antes llamado Horarios se muestra como «Turnos de profesionales». La página tiene un asistente de turnos, fichas verticales de profesionales con su número de turnos, alta manual horizontal y tarjetas verticales de todos los turnos activos del profesional seleccionado. Cada tarjeta muestra día, horas locales y fechas de vigencia, con edición o retirada en bocadillo central. Se pueden registrar varios turnos por día sin ocultarlos. Se mantienen las reglas de horario existentes (lunes a viernes, mañana/tarde, inicio por hora y final en intervalos de 15 minutos). Retirar un turno sólo desactiva la regla y mantiene las citas ya reservadas.

La gestión manual y la IA usan `shift-plan.ts` para validar fechas, profesionales de la clínica, límites horarios y solapamientos entre cambios y con el calendario actual. Los cambios se guardan en una transacción Serializable; los errores revierten toda la propuesta. `GET /scheduling/rules` devuelve todas las reglas activas de la clínica y `PATCH /scheduling/rules/:id/disable` retira una regla. Se conservan las rutas anteriores de alta, edición, consulta por profesional y ausencias.

El nuevo asistente usa la misma `ANTHROPIC_API_KEY` y `ANTHROPIC_MODEL` (por defecto `claude-sonnet-5-5`) del servidor, sin sustituir el asistente de citas. `POST /scheduling/assistant/ask` conecta herramientas de profesionales, turnos y preparación de hasta 20 cambios. Envía fecha actual y zona horaria de la clínica; los minutos son horas locales. La API prepara el resumen real y valida los datos antes de devolverlo. El usuario revisa y pulsa Confirmar cambios; `POST /scheduling/assistant/confirm` vuelve a validar el estado y escribe. Las propuestas duran diez minutos, pertenecen al usuario/clínica y se consumen una sola vez. Se conservan en memoria del proceso: un reinicio o un despliegue obliga a preparar de nuevo la propuesta. Los permisos de escritura se comprueban en preparación y confirmación.

El chat de turnos utiliza un canal propio en `assistant-conversation.ts`, separado del chat de citas y asociado a usuario/clínica; conserva borrador e historial al navegar y en sessionStorage. Las propuestas pendientes no se reactivan al recargar. Si la IA falla o no hay clave, la gestión manual sigue disponible.

Validación local (sin datos reales ni llamadas reales a OpenAI):

```bash
npm run test -w @nexoclinic/api -- --runTestsByPath test/scheduling.service.spec.ts test/shift-plan.spec.ts test/shift-assistant.spec.ts
python scripts/test-professional-shifts-browser.py
python scripts/test-navigation-browser.py
python scripts/test-professional-edit-browser.py
```

Las pruebas cubren fechas inválidas, conflictos, propuestas obsoletas, permisos y alcance de clínica, confirmación única, caducidad, rollback de lote, gestión manual, propuestas sin escrituras, refresco tras confirmación, aislamiento del chat y tamaños móviles. `scripts/deploy-professional-shifts.sh SHA` prepara copias de fuentes/base de datos y actualiza API/web conservando el asistente de citas personalizado y Compose. No se necesita una migración nueva para turnos; el script incluye las migraciones anteriores para instalaciones con cambios pendientes.

Se conserva la reserva manual desde un turno existente mediante `shift-reservation.tsx`, ahora con el formulario en un bocadillo central.

El chat tiene altura máxima adaptable, desplazamiento independiente y barra de scroll visible cuando hay más mensajes. El asistente de turnos desplaza el historial al mensaje más reciente; Enter envía mediante el mismo formulario que Consultar IA y Shift+Enter permite un salto de línea. Se respetan la composición de texto y el estado de envío para evitar envíos repetidos.

El asistente filtra las propuestas mediante `available-shifts.ts`: muestra sólo los cambios aplicables y mantiene juntos los cambios relacionados por profesional (incluidos traslados entre profesionales) para no retirar un turno cuya sustitución no se pueda guardar. Si una solicitud individual no encaja, ofrece hasta cinco alternativas de horario para el mismo profesional, día, duración y vigencia, comprobadas con las mismas reglas y sin prepararlas hasta que el usuario elija. Si no hay opciones, pide otro horario o periodo. No se listan los profesionales descartados ni los errores técnicos de solapamiento en la respuesta. La confirmación sigue validando la propuesta completa; si los datos cambiaron, solicita volver a consultar en lugar de modificar silenciosamente lo que el usuario confirmó. Pruebas: `available-shifts.spec.ts`, `shift-assistant.spec.ts`, `shift-plan.spec.ts` y `scheduling.service.spec.ts`.

El asistente incorpora `prepare_shift_swap` para intercambiar los turnos completos de dos profesionales distintos, aunque tengan días, horas o periodos diferentes. La propuesta muestra antes/después de ambos y se aplica como una sola transacción. Las citas de pacientes y sus profesionales no se modifican. Los intercambios y cambios personalizados que impliquen a varios profesionales requieren marcar que los implicados están de acuerdo; la API exige `colleaguesAgree: true` antes de consumir la propuesta. Esta confirmación la realiza el usuario gestor, sin firmas individuales ni cambios de citas. No se necesita migración.

Referencia de plantillas aportada por el usuario: [Colorlib](https://colorlib.com/wp/templates/), para consultar como inspiración visual.

Los campos de texto, áreas de texto y selectores comparten un borde negro de 1 px y sombra exterior oscura difuminada en acceso/registro, CRM y bocadillos. El foco mantiene el borde negro y añade un contorno índigo visible. Se excluyen casillas, radios y controles que no son campos de texto o selectores.

El pie común aparece tanto en acceso/registro como en todas las vistas del CRM. Identifica la propiedad de nexodigitaldesign con enlace a `https://nexodigitaldesing.com/#inicio`, correo `jotolmor45@nexodigitaldesing.com` y teléfono `+34 630 289 699`, mediante enlaces web, mailto y tel. Se dispone en una columna alineada a la derecha, tanto en escritorio como en móvil, manteniéndose al final de la página sin tapar contenido. Incluye el símbolo de copyright junto a la propiedad e iconos SVG de correo y teléfono, decorativos para los lectores de pantalla.

El espacio libre a la izquierda del bloque de contacto del pie incorpora una línea decorativa horizontal de 1 px, centrada verticalmente y en tono del fondo del CRM (#dce3ef). La retícula calcula el ancho libre sin invadir los contactos. En móvil la línea ocupa el ancho interior sobre el bloque de contacto, que sigue alineado a la derecha.
