import 'reflect-metadata';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { PatientsController } from '../src/patients/patients.controller';
import { PatientsService } from '../src/patients/patients.service';
const user = { tenantId: 'tenant', clinicId: 'clinic', role: 'CLINIC_OWNER' };
const base = { firstName: 'Candela', lastName: 'Soto' };
const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
const createDto = Reflect.getMetadata('design:paramtypes', PatientsController.prototype, 'create')[1];
const queryDto = Reflect.getMetadata('design:paramtypes', PatientsController.prototype, 'list')[1];
const validate = (value: unknown) => pipe.transform(value, { type: 'body', metatype: createDto });
function setup() {
  const record: any = { id: 'patient', ...base, dni: '12345678Z', phone: '+34 630-289-699' };
  const prisma = { patient: {
    create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'new', ...data })),
    findMany: jest.fn().mockResolvedValue([record, { id: 'other', ...base, phone: '654000000' }]),
    updateMany: jest.fn().mockImplementation(({ data }) => { Object.assign(record, data); return Promise.resolve({ count: 1 }); }),
    findFirstOrThrow: jest.fn().mockResolvedValue(record)
  }};
  return { service: new PatientsService(prisma as any), prisma, record };
}
describe('Patient DNI and search', () => {
  it('accepts optional DNI, normalizes it and keeps existing clients valid', async () => {
    const { service } = setup();
    await expect(service.create(user, await validate({ ...base, dni: ' 12.345.678-z ' }))).resolves.toMatchObject({ ...base, dni: '12345678Z', tenantId: 'tenant', clinicId: 'clinic' });
    await expect(service.create(user, await validate(base))).resolves.toMatchObject(base);
  });
  it('can clear DNI in the existing patient editor', async () => {
    const { service, prisma } = setup();
    await expect(service.update(user, 'patient', await validate({ ...base, dni: null }))).resolves.toMatchObject({ dni: null });
    expect(prisma.patient.updateMany).toHaveBeenCalledWith({ where: { id: 'patient', tenantId: 'tenant', clinicId: 'clinic' }, data: { ...base, dni: null } });
  });
  it('rejects malformed identity data before writing', async () => {
    const { service, prisma } = setup();
    for (const dni of [1234, 'x'.repeat(21), 'a']) await expect(validate({ ...base, dni })).rejects.toThrow();
    for (const dni of ['---', '   ', 'abc<>']) await expect(service.create(user, { ...base, dni })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.patient.create).not.toHaveBeenCalled();
  });
  it('combines all entered search filters with authenticated clinic scope', async () => {
    const { service, prisma } = setup();
    const filters = await pipe.transform({ name: ' Candela Soto ', dni: '123.456-78z', phone: '630 289 699' }, { type: 'query', metatype: queryDto });
    await expect(service.list(user, undefined, filters)).resolves.toMatchObject([{ id: 'patient' }]);
    expect(prisma.patient.findMany).toHaveBeenCalledWith({ where: { tenantId: 'tenant', clinicId: 'clinic', AND: ['Candela', 'Soto'].map(part => ({ OR: [{ firstName: { contains: part, mode: 'insensitive' } }, { lastName: { contains: part, mode: 'insensitive' } }] })), dni: { contains: '12345678Z', mode: 'insensitive' } }, orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }] });
  });
  it('searches by surname alone without matching the first name', async () => {
    const { service, prisma } = setup();
    const filters = await pipe.transform({ lastName: ' Soto Pérez ' }, { type: 'query', metatype: queryDto });
    await service.list(user, undefined, filters);
    expect(prisma.patient.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: 'tenant', clinicId: 'clinic', AND: ['Soto', 'Pérez'].map(part => ({ lastName: { contains: part, mode: 'insensitive' } })) } }));
  });
  it('combines separate first and last name with DNI', async () => {
    const { service, prisma } = setup();
    await service.list(user, undefined, { firstName: 'Candela', lastName: 'Soto', dni: '12345678z' });
    expect(prisma.patient.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: 'tenant', clinicId: 'clinic', AND: [{ firstName: { contains: 'Candela', mode: 'insensitive' } }, { lastName: { contains: 'Soto', mode: 'insensitive' } }], dni: { contains: '12345678Z', mode: 'insensitive' } } }));
  });
  it('matches formatted phone numbers without changing stored phone data', async () => {
    const { service } = setup();
    await expect(service.list(user, undefined, { phone: '(+34) 630 289-699' })).resolves.toMatchObject([{ id: 'patient', phone: '+34 630-289-699' }]);
    await expect(service.list(user, undefined, { phone: '99999999' })).resolves.toEqual([]);
  });
  it('retains the existing general search contract', async () => {
    const { service, prisma } = setup();
    await service.list(user, 'Soto');
    expect(prisma.patient.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: 'tenant', clinicId: 'clinic', OR: [{ firstName: { contains: 'Soto', mode: 'insensitive' } }, { lastName: { contains: 'Soto', mode: 'insensitive' } }, { email: { contains: 'Soto', mode: 'insensitive' } }] } }));
  });
  it('rejects invalid searches and oversized query input', async () => {
    const { service, prisma } = setup();
    await expect(service.list(user, undefined, { dni: '...' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.list(user, undefined, { phone: 'abc' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(pipe.transform({ name: 'x'.repeat(121) }, { type: 'query', metatype: queryDto })).rejects.toThrow();
    expect(prisma.patient.findMany).not.toHaveBeenCalled();
  });
});
