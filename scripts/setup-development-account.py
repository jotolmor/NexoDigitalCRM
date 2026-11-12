#!/usr/bin/env python3
"""Provision one development login on the VPS; credentials travel only over stdin."""
import argparse
import getpass
import json
import subprocess

PROVISION = r"""
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const { randomUUID } = require('node:crypto');
const prisma = new PrismaClient();
let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => raw += chunk);
process.stdin.on('end', async () => {
  try {
    const input = JSON.parse(raw);
    const existing = await prisma.user.findUnique({where:{email:input.email}});
    if (existing && !input.enableExisting) throw new Error('EXISTS');
    if (input.enableExisting && (!existing || existing.role !== 'CLINIC_OWNER' || !existing.clinicId || !(await bcrypt.compare(input.password,existing.passwordHash)))) throw new Error('INVALID_OWNER');
    if (existing) {
      await prisma.$transaction(async tx => {
        const membership = await tx.developmentBusiness.findUnique({where:{clinicId:existing.clinicId}});
        if (membership && membership.developerUserId !== existing.id) throw new Error('FOREIGN_BUSINESS');
        if (!membership) await tx.developmentBusiness.create({data:{developerUserId:existing.id,clinicId:existing.clinicId}});
        await tx.user.update({where:{id:existing.id},data:{isDeveloper:true}});
      });
    } else {
      const passwordHash = await bcrypt.hash(input.password,12);
      await prisma.$transaction(async tx => {
        const tenant = await tx.tenant.create({data:{name:'Desarrollo NexoCRM',slug:'dev-root-'+randomUUID()}});
        const clinic = await tx.clinic.create({data:{tenantId:tenant.id,name:'Desarrollo NexoCRM',specialty:'Desarrollo y pruebas',businessType:'OTHER',terminology:{customer:'cliente',customers:'clientes',professional:'miembro',professionals:'miembros',appointment:'reserva',appointments:'reservas',service:'servicio',services:'servicios'}}});
        const user = await tx.user.create({data:{tenantId:tenant.id,clinicId:clinic.id,email:input.email,name:input.name,passwordHash,role:'CLINIC_OWNER',isDeveloper:true}});
        await tx.developmentBusiness.create({data:{developerUserId:user.id,clinicId:clinic.id}});
      });
    }
    console.log('Usuario único de desarrollo habilitado. Inicia sesión de nuevo para ver el selector de negocios.');
  } catch(error) {
    const messages = {EXISTS:'El correo ya existe. Para habilitar una cuenta de pruebas existente, usa --enable-existing y su contraseña actual.',INVALID_OWNER:'No se pudo verificar la cuenta propietaria y su contraseña. No se ha modificado la cuenta.',FOREIGN_BUSINESS:'El negocio ya pertenece a otro espacio de desarrollo.'};
    console.error(messages[error.message] || (error.code === 'P2002' ? 'Ese correo ya está registrado.' : 'No se pudo preparar la cuenta. Comprueba que has desplegado la versión y sus migraciones.'));
    process.exitCode = 1;
  } finally { await prisma.$disconnect(); }
});
"""


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--enable-existing', action='store_true', help='Habilita una cuenta propietaria de pruebas existente, verificando su contraseña; no la restablece.')
    args = parser.parse_args()
    email = input('Correo del usuario de desarrollo: ').strip().lower()
    if '@' not in email or not email.rsplit('@', 1)[-1]:
        parser.error('Introduce un correo válido.')
    name = 'Desarrollo' if args.enable_existing else input('Tu nombre [Desarrollo]: ').strip() or 'Desarrollo'
    password = getpass.getpass('Contraseña actual: ' if args.enable_existing else 'Contraseña nueva (mínimo 12 caracteres): ')
    if not args.enable_existing:
        if len(password) < 12:
            parser.error('La contraseña debe tener al menos 12 caracteres.')
        if password != getpass.getpass('Repite la contraseña: '):
            parser.error('Las contraseñas no coinciden.')
    try:
        result = subprocess.run([
            'docker', 'compose', '-f', 'docker-compose.yml', '-f', 'api.yml',
            '-f', 'web.yml', '-f', 'public.yml', 'exec', '-T', 'api', 'node', '-e', PROVISION,
        ], cwd='/opt/nexocrm-deploy', input=json.dumps({
            'email': email, 'name': name, 'password': password, 'enableExisting': args.enable_existing,
        }), text=True, capture_output=True, check=False)
    except (OSError, subprocess.SubprocessError):
        raise SystemExit('No se pudo ejecutar Docker en el VPS.') from None
    # Only display known application messages; never echo container diagnostics or credentials.
    if result.returncode:
        known = [line for line in result.stderr.splitlines() if line.startswith(('El correo ya existe.', 'No se pudo verificar', 'El negocio ya pertenece', 'Ese correo ya está registrado.', 'No se pudo preparar la cuenta.'))]
        raise SystemExit(known[-1] if known else 'No se pudo ejecutar la preparación. Comprueba el estado del contenedor api.')
    if 'Usuario único de desarrollo habilitado.' not in result.stdout:
        raise SystemExit('La ejecución no confirmó el alta. Comprueba si puedes iniciar sesión antes de repetirla.')
    print('Usuario único de desarrollo habilitado: ' + email)
    print('Acceso: https://nexocrm.nexodigitaldesing.com')
    print('Inicia sesión de nuevo. Verás Negocio activo y Crear negocio de prueba.')
    print('La contraseña no se muestra ni se guarda en archivos.')


if __name__ == '__main__':
    main()
