import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { AuthController } from '../src/auth/auth.controller';
import { AuthService } from '../src/auth/auth.service';

jest.mock('bcrypt', () => ({ hash: jest.fn().mockResolvedValue('fixture-hash') }));

const registration = { clinicName: 'Clínica Prueba', specialty: 'Odontología', businessType: 'CLINIC', name: 'Usuario', email: 'usuario@example.invalid', password: 'fixture-password-123' };

function setup() {
  const tx = {
    tenant: { create: jest.fn().mockResolvedValue({ id: 'tenant' }) },
    clinic: { create: jest.fn().mockResolvedValue({ id: 'clinic' }) },
    user: { create: jest.fn().mockResolvedValue({ id: 'user', tenantId: 'tenant', clinicId: 'clinic', name: 'Usuario', email: registration.email, role: 'CLINIC_OWNER' }) }
  };
  const prisma = { tenant: { findUnique: jest.fn().mockResolvedValue(null) }, $transaction: jest.fn().mockImplementation(callback => callback(tx)) };
  return { tx, service: new AuthService(prisma as any, { sign: jest.fn().mockReturnValue('fixture-token') } as any) };
}

describe('Registration address', () => {
  const dto = Reflect.getMetadata('design:paramtypes', AuthController.prototype, 'register')[0];
  const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
  const validate = (value: unknown) => pipe.transform(value, { type: 'body', metatype: dto });

  it('accepts and persists the trimmed address in the clinic transaction', async () => {
    const input = await validate({ ...registration, address: '  Calle Prueba, 35, Sevilla  ' });
    const { tx, service } = setup();
    await expect(service.register(input)).resolves.toMatchObject({ accessToken: 'fixture-token' });
    expect(tx.clinic.create).toHaveBeenCalledWith({ data: expect.objectContaining({ address: 'Calle Prueba, 35, Sevilla', tenantId: 'tenant' }) });
    expect(tx.user.create).toHaveBeenCalledWith({ data: expect.objectContaining({ clinicId: 'clinic', tenantId: 'tenant' }) });
  });

  it('keeps registration compatible with older clients that omit address', async () => {
    const input = await validate(registration);
    const { tx, service } = setup();
    await service.register(input);
    expect(tx.clinic.create).toHaveBeenCalledWith({ data: expect.objectContaining({ address: null }) });
  });

  it('rejects non-text and overlong addresses before saving', async () => {
    await expect(validate({ ...registration, address: { street: 'invalid' } })).rejects.toThrow();
    await expect(validate({ ...registration, address: 'x'.repeat(301) })).rejects.toThrow();
  });
});
