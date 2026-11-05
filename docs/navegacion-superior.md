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
