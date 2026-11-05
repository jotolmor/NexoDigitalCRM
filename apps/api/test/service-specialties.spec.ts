import 'reflect-metadata';
import { NotFoundException, ValidationPipe } from '@nestjs/common';
import { CatalogController } from '../src/catalog/catalog.controller';
import { CatalogService } from '../src/catalog/catalog.service';

const user = { tenantId: 'tenant', clinicId: 'clinic', role: 'CLINIC_OWNER' };
const base = { name: 'Revisión', durationMinutes: 30, priceEuros: 35 };
const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
const createDto = Reflect.getMetadata('design:paramtypes', CatalogController.prototype, 'createService')[1];
const updateDto = Reflect.getMetadata('design:paramtypes', CatalogController.prototype, 'updateService')[2];
const validate = (body: unknown, update = false) => pipe.transform(body, { type: 'body', metatype: update ? updateDto : createDto });
function setup() {
  const record: any = { id: 'service', tenantId: 'tenant', clinicId: 'clinic', ...base, profession: 'Odontología', specialty: 'Odontología general' };
  const prisma = { service: {
    create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'new', ...data })),
    updateMany: jest.fn().mockImplementation(({ where, data }) => {
      if (where.id !== record.id || where.tenantId !== record.tenantId || where.clinicId !== record.clinicId) return Promise.resolve({ count: 0 });
      Object.assign(record, data); return Promise.resolve({ count: 1 });
    }),
    findFirstOrThrow: jest.fn().mockResolvedValue(record),
    findMany: jest.fn().mockResolvedValue([record])
  }};
  return { service: new CatalogService(prisma as any), prisma, record };
}
describe('Service profession and specialty', () => {
  it('validates and stores classification with tenant and clinic scope', async () => {
    const { service, prisma } = setup();
    const input = await validate({ ...base, profession: 'Medicina', specialty: 'Cardiología' });
    await expect(service.createService(user, input)).resolves.toMatchObject({ ...base, tenantId: 'tenant', clinicId: 'clinic', profession: 'Medicina', specialty: 'Cardiología' });
    expect(prisma.service.create).toHaveBeenCalledTimes(1);
  });
  it('accepts older clients and existing services without classification', async () => {
    const { service } = setup();
    await expect(service.createService(user, await validate(base))).resolves.toMatchObject(base);
    const { profession, specialty, ...rest } = await validate({ name: 'Revisión actualizada' }, true);
    expect(profession).toBeUndefined(); expect(specialty).toBeUndefined();
    await expect(service.updateService(user, 'service', rest)).resolves.toMatchObject({ profession: 'Odontología', specialty: 'Odontología general' });
  });
  it('supports custom specialties and clearing optional classification', async () => {
    const { service, prisma } = setup();
    await expect(service.updateService(user, 'service', await validate({ name: 'Revisión', profession: 'Otra profesión', specialty: 'Especialidad propia' }, true))).resolves.toMatchObject({ specialty: 'Especialidad propia' });
    await expect(service.updateService(user, 'service', await validate({ name: 'Revisión', profession: null, specialty: null }, true))).resolves.toMatchObject({ profession: null, specialty: null });
    expect(prisma.service.updateMany).toHaveBeenLastCalledWith({ where: { id: 'service', tenantId: 'tenant', clinicId: 'clinic' }, data: { name: 'Revisión', profession: null, specialty: null } });
  });
  it('rejects malformed classification, unsupported durations and extra properties', async () => {
    for (const key of ['profession', 'specialty']) for (const value of [1, '', 'a', 'x'.repeat(121)]) {
      await expect(validate({ ...base, [key]: value })).rejects.toThrow();
      await expect(validate({ name: 'Revisión', [key]: value }, true)).rejects.toThrow();
    }
    await expect(validate({ ...base, durationMinutes: 45 })).rejects.toThrow();
    await expect(validate({ ...base, tenantId: 'another' })).rejects.toThrow();
  });
  it('keeps reads and updates inside the authenticated clinic', async () => {
    const { service, prisma } = setup();
    await service.listServices(user);
    expect(prisma.service.findMany).toHaveBeenCalledWith({ where: { tenantId: 'tenant', clinicId: 'clinic' }, orderBy: { name: 'asc' } });
    await expect(service.updateService({ ...user, clinicId: 'other' }, 'service', { name: 'Revisión', specialty: 'Ortodoncia' })).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.service.findFirstOrThrow).not.toHaveBeenCalled();
  });
});
