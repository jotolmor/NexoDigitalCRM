# Un usuario para todos los negocios de desarrollo

La cuenta de desarrollo permite crear negocios de cualquiera de los ocho sectores y alternar entre ellos sin volver a introducir la contraseña. Cada negocio tiene su propio tenant y clínica, con clientes, profesionales y servicios separados. Solo aparecen los negocios vinculados a ese usuario; no es un administrador global de cuentas ajenas.

## Preparación en el VPS

1. Despliega la versión con `scripts/deploy-n8n-automations.sh SHA_COMPLETO`. El script incluye la nueva migración, copia de seguridad y compilación de API y web. Conserva el modo y canales existentes de n8n.
2. Ejecuta `python3 /opt/nexocrm/scripts/setup-development-account.py`.
3. Introduce un correo de desarrollo nuevo y una contraseña de al menos 12 caracteres. No se imprimen ni guardan la contraseña ni tokens. La contraseña se almacena como hash bcrypt en la base de datos.
4. Inicia sesión en el CRM. Aparecerán **Negocio activo** y **Crear negocio de prueba**, debajo de la cabecera.

Si ya creaste una cuenta independiente de pruebas, puedes habilitarla con:

```bash
python3 /opt/nexocrm/scripts/setup-development-account.py --enable-existing
```

Este modo exige su contraseña actual, no la restablece y vincula únicamente su negocio principal, además de conservar los negocios de desarrollo que ya tuviera. Cierra sesión e inicia sesión para actualizar el perfil del navegador.

## Uso

- **Crear negocio de prueba**: nombre, dirección, sector y especialidad o actividad. La lista de actividades depende del sector y permite escribir otra actividad.
- Al crear el negocio, se abre directamente con la misma cuenta.
- **Negocio activo** permite volver a cualquiera de tus negocios anteriores.
- Cada cambio emite un JWT limitado al negocio elegido y limpia consultas, conversaciones de asistentes, formularios y navegación del negocio anterior.
- Se mantienen las reglas de cada sector: Clínicas usa Pacientes; los negocios de servicios usan Clientes; Educación usa Alumnos; Taller y automoción no muestra la agenda de citas.
- Crear un negocio no habilita n8n ni envíos reales en ese negocio.

## Contrato

`User.isDeveloper` es falso por defecto y no se acepta en el registro público ni en formularios de miembros. Solo se habilita mediante el script administrativo del VPS. Los endpoints autenticados son:

- `GET /api/development/businesses`: negocios vinculados al usuario autenticado.
- `POST /api/development/businesses`: crea un tenant, clínica y vínculo en una transacción; devuelve una sesión para ese negocio.
- `POST /api/development/businesses/:id/select`: exige un vínculo del mismo usuario antes de emitir una sesión.

Los usuarios normales reciben 403. Una selección sin vínculo devuelve 404, sin exponer datos del negocio. Los tenants y clínicas no se toman del cuerpo de la petición.
