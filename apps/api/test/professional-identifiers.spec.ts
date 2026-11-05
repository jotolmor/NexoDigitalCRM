import 'reflect-metadata';
import { BadRequestException, NotFoundException, ValidationPipe } from '@nestjs/common';
import { CatalogController } from '../src/catalog/catalog.controller';
import { CatalogService } from '../src/catalog/catalog.service';
const user = { tenantId: 'tenant', clinicId: 'clinic', role: 'CLINIC_OWNER' };
const base = { firstName: 'Clara', lastName: 'Montoro', specialty: 'Odontología general' };
const dto = Reflect.getMetadata('design:paramtypes', CatalogController.prototype, 'createProfessional')[1];
const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
const validate = (value: unknown) => pipe.transform(value, { type: 'body', metatype: dto });
function setup() {
  const record: any = { id: 'pro', ...base, dni: '12345678Z', nif: 'B12345678' };
  const prisma = { professional: {
    create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'new', ...data })),
    updateMany: jest.fn().mockImplementation(({ where, data }) => {
      if (where.id !== 'pro' || where.clinicId !== 'clinic' || where.tenantId !== 'tenant') return Promise.resolve({ count: 0 });
      Object.assign(record, data); return Promise.resolve({ count: 1 });
    }),
    findFirstOrThrow: jest.fn().mockResolvedValue(record)
  }};
  return { service: new CatalogService(prisma as any), prisma };
}
describe('Professional DNI and NIF', () => {
  it('stores both identifiers normalized within the authenticated clinic', async () => {
    const { service, prisma } = setup();
    await expect(service.createProfessional(user, await validate({ ...base, dni: '12.345.678-z', nif: ' b-12345678 ' }))).resolves.toMatchObject({ ...base, dni: '12345678Z', nif: 'B12345678', tenantId: 'tenant', clinicId: 'clinic' });
    expect(prisma.professional.create).toHaveBeenCalledTimes(1);
  });
  it('keeps older clients valid and leaves omitted identifiers unchanged on update', async () => {
    const { service } = setup();
    await expect(service.createProfessional(user, await validate(base))).resolves.toMatchObject(base);
    await expect(service.updateProfessional(user, 'pro', await validate(base))).resolves.toMatchObject({ dni: '12345678Z', nif: 'B12345678' });
  });
  it('updates or clears either identifier independently', async () => {
    const { service, prisma } = setup();
    await expect(service.updateProfessional(user, 'pro', await validate({ ...base, dni: 'x-1234567-l' }))).resolves.toMatchObject({ dni: 'X1234567L', nif: 'B12345678' });
    await expect(service.updateProfessional(user, 'pro', await validate({ ...base, dni: null, nif: null }))).resolves.toMatchObject({ dni: null, nif: null });
    expect(prisma.professional.updateMany).toHaveBeenLastCalledWith({ where: { id: 'pro', tenantId: 'tenant', clinicId: 'clinic' }, data: { ...base, dni: null, nif: null } });
  });
  it('rejects malformed identifiers before writing', async () => {
    const { service, prisma } = setup();
    for (const field of ['dni', 'nif']) {
      for (const value of [1234, 'a', 'x'.repeat(21)]) await expect(validate({ ...base, [field]: value })).rejects.toThrow();
      for (const value of ['---', '   ', 'abc<>']) await expect(async () => service.createProfessional(user, { ...base, [field]: value })).rejects.toBeInstanceOf(BadRequestException);
    }
    expect(prisma.professional.create).not.toHaveBeenCalled();
  });
  it('does not update a professional belonging to another clinic', async () => {
    const { service, prisma } = setup();
    await expect(service.updateProfessional({ ...user, clinicId: 'other' }, 'pro', { ...base, dni: 'X1234567L' })).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.professional.findFirstOrThrow).not.toHaveBeenCalled();
  });
});
