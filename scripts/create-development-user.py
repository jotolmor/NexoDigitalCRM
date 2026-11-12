#!/usr/bin/env python3
"""Create an independent CRM test business via the regular registration API."""
import argparse
import getpass
import json
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url', default='https://nexocrm.nexodigitaldesing.com')
    parser.add_argument('--business-type', default='OTHER', choices=[
        'CLINIC', 'BEAUTY', 'FITNESS', 'EDUCATION', 'PROFESSIONAL_SERVICES',
        'HOME_SERVICES', 'AUTOMOTIVE', 'OTHER',
    ])
    args = parser.parse_args()
    parsed = urlsplit(args.url)
    if parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment:
        parser.error('Usa la dirección HTTPS del CRM, sin credenciales ni parámetros.')
    email = input('Correo NUEVO para desarrollo: ').strip().lower()
    if '@' not in email or not email.rsplit('@', 1)[-1]:
        parser.error('Introduce un correo válido y diferente del de tu cuenta principal.')
    name = input('Nombre del usuario [Desarrollo]: ').strip() or 'Desarrollo'
    business = input('Nombre del negocio de pruebas [Desarrollo NexoCRM]: ').strip() or 'Desarrollo NexoCRM'
    password = getpass.getpass('Contraseña nueva (mínimo 12 caracteres, no se muestra): ')
    confirmation = getpass.getpass('Repite la contraseña: ')
    if len(password) < 12:
        parser.error('La contraseña debe tener al menos 12 caracteres.')
    if password != confirmation:
        parser.error('Las contraseñas no coinciden. No se ha creado la cuenta.')
    body = {
        'clinicName': business, 'specialty': 'Desarrollo y pruebas',
        'businessType': args.business_type, 'name': name,
        'email': email, 'password': password,
    }
    request = Request(args.url.rstrip('/') + '/api/auth/register',
                      data=json.dumps(body).encode(),
                      headers={'Content-Type': 'application/json'}, method='POST')
    try:
        with urlopen(request, timeout=30) as response:
            result = json.load(response)
    except HTTPError as error:
        if error.code == 409:
            raise SystemExit('El correo o el nombre del negocio ya está registrado. Usa otros datos; no se ha modificado ninguna cuenta existente.') from None
        raise SystemExit(f'La API respondió HTTP {error.code}. Comprueba los datos y los logs de la API. No compartas la contraseña.') from None
    except (URLError, TimeoutError):
        raise SystemExit('No se pudo completar la conexión con el CRM. Antes de repetir el alta, comprueba si puedes iniciar sesión con los datos elegidos.') from None
    if not result.get('user', {}).get('id'):
        raise SystemExit('La respuesta no confirma el alta. Comprueba si puedes iniciar sesión antes de repetirla.')
    print('Cuenta de desarrollo creada con un negocio de pruebas independiente.')
    print('Acceso: ' + args.url.rstrip('/'))
    print('Usuario: ' + email)
    print('Contraseña: la que acabas de introducir. No se imprime ni se guarda en archivos.')
    print('Esta cuenta es propietaria de su negocio de pruebas; no recibe acceso a las clínicas existentes.')


if __name__ == '__main__':
    main()
