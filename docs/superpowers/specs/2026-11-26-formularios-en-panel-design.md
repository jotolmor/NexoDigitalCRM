# Formularios de alta en panel lateral — diseño corto

**Para qué:** que cada sección abra mostrando lo que se consulta (agenda, listado) y que los formularios de alta aparezcan solo al pedirlos. Hoy «Citas» muestra siempre el alta de paciente y «Nueva cita», y «Profesionales» y «Servicios» muestran siempre «Añadir…».

**Objetivos**
- Botones arriba a la derecha: «+ Nueva cita» y «+ Nuevo paciente» en Citas; «+ Nuevo paciente» en Pacientes (en todos los sectores); «+ Añadir profesional» y «+ Añadir servicio» en sus secciones.
- Cada botón abre un panel lateral (el mismo aspecto que el de la agenda) con el formulario existente, sin cambiar sus campos ni validaciones. Se cierra con «Cerrar» o Escape; el foco entra en el panel y vuelve al botón al cerrar.
- Al crear un paciente desde Citas, el panel pasa a «Nueva cita» con ese paciente elegido. Al reservar, el panel se cierra.
- En Profesionales y Servicios el panel sigue abierto tras guardar, con el mensaje de éxito, para poder añadir varios seguidos.

**Fuera de alcance:** buscador de pacientes, selector con búsqueda, cambios de API.

**Enfoques considerados**
1. **Componente `SidePanel` reutilizable que envuelve los formularios existentes** (elegido): cambio pequeño y localizado en `main.tsx`; mismo estilo y comportamiento de foco que el panel de la agenda.
2. Ventanas modales centradas: tapan la agenda y el listado, que es justo lo que se quiere seguir viendo.
3. Formularios plegables en su sitio (acordeón): la página sigue creciendo al abrirlos y no resuelve el desplazamiento.

**Decisiones mías:** el estilo del panel pasa a `side-panel.css`, compartido con el panel de la agenda; el formulario de paciente se muestra en una columna dentro del panel.
