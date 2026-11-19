import { PrismaClient } from '@prisma/client';

async function main() {
  const [mode, inputEmail] = process.argv.slice(2);
  if (!inputEmail || !['grant', 'revoke'].includes(mode)) {
    throw new Error('Uso: node dist/platform/set-platform-admin.js grant|revoke correo');
  }
  const prisma = new PrismaClient();
  try {
    const email = inputEmail.trim().toLowerCase();
    const updated = await prisma.user.updateMany({
      where: { email },
      data: { isPlatformAdmin: mode === 'grant' },
    });
    if (updated.count !== 1) throw new Error('No hay una cuenta registrada con ese correo.');
    console.log(mode === 'grant' ? 'Administración de plataforma habilitada.' : 'Administración de plataforma revocada.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Error al modificar los permisos.');
  process.exitCode = 1;
});
