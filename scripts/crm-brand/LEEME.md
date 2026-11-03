# CrmNexodigitalAssist

Identidad original: monograma N, conversación y destello de asistencia.
Paleta: azul noche #0f172a, índigo #4f46e5 y turquesa #14b8a6.

SVGs adaptados a menú oscuro, acceso claro y favicon. Texto exacto de la marca
identificado también mediante aria-label. Sin fuentes ni librerías externas.

Ejecutar apply-brand.py sobre /opt/nexocrm. Comprueba los tres puntos de marca
anteriores, crea respaldo en /root/backups/nexocrm y modifica solo el frontend.
Conserva todos los demás cambios del VPS. No cambia API, credenciales ni datos.
Después compilar y actualizar únicamente web con los cuatro archivos Compose.

Validación: TypeScript y Vite; Playwright con API simulada, versiones clara/oscura,
título y acceso móvil sin desbordamiento. También pasa la prueba de navegación y
memoria del asistente. Revisado visualmente en escritorio y móvil.

Las propuestas visuales iniciales se generaron con la herramienta de imágenes
disponible; MagicPath no disponía de herramientas conectadas en esta sesión.
La versión de producción se construyó en SVG para tipografía precisa y escalado.
