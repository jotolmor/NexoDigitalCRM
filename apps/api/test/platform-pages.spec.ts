import { ForbiddenException, ValidationPipe } from '@nestjs/common';
import { PlatformController } from '../src/platform/platform.module';
import { AuthService } from '../src/auth/auth.service';
import { PrismaService } from '../src/prisma.service';

const session = { sub: 'user', tenantId: 'own', clinicId: 'own-clinic', role: 'CLINIC_OWNER' };
const layout = { sections: [{ id: 'Citas', title: ' Reservas ', visible: false }], pages: [] };

function setup(isPlatformAdmin: boolean) {
  const prisma = {
    user: { findUnique: jest.fn().mockResolvedValue({ isPlatformAdmin }) },
    clinic: { findMany: jest.fn(), update: jest.fn(), findUniqueOrThrow: jest.fn() },
  };
  const auth = { register: jest.fn().mockResolvedValue({ user: { clinicId: 'new-clinic' } }) };
  const controller = new PlatformController(prisma as unknown as PrismaService, auth as unknown as AuthService);
  return { controller, prisma, auth };
}

describe('platform business pages', () => {
  it('rejects a tenant owner on every platform operation', async () => {
    const { controller, prisma, auth } = setup(false);
    await expect(controller.list({ user: session })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(controller.create({ user: session }, {} as never)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(controller.updatePages({ user: session }, 'other-clinic', layout)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.clinic.findMany).not.toHaveBeenCalled();
    expect(auth.register).not.toHaveBeenCalled();
    expect(prisma.clinic.update).not.toHaveBeenCalled();
  });

  it('writes the layout only to the selected business', async () => {
    const { controller, prisma } = setup(true);
    await controller.updatePages({ user: session }, 'other-clinic', layout);
    expect(prisma.clinic.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'other-clinic' },
      data: { workspacePages: { sections: [{ id: 'Citas', title: 'Reservas', visible: false }], pages: [] } },
    }));
  });

  it('rejects duplicate sections and blocks without content objects', async () => {
    const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
    const [, , metatype] = Reflect.getMetadata('design:paramtypes', PlatformController.prototype, 'updatePages');
    const metadata = { type: 'body' as const, metatype };
    await expect(pipe.transform({ sections: [layout.sections[0], layout.sections[0]], pages: [] }, metadata)).rejects.toThrow();
    await expect(pipe.transform({ sections: [], pages: [{ id: 'test', title: 'Test', visible: true, blocks: [null] }] }, metadata)).rejects.toThrow();
    await expect(pipe.transform(layout, metadata)).resolves.toEqual(layout);
  });
});
