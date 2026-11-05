import 'reflect-metadata';
import { BadRequestException, NotFoundException, ValidationPipe } from '@nestjs/common';
import { PatientsController } from '../src/patients/patients.controller';
import { PatientsService } from '../src/patients/patients.service';
import { clinicToday, patientAgeOnDate } from '../src/patients/patient-demographics';

const user = { tenantId: 'tenant', clinicId: 'clinic', role: 'CLINIC_OWNER' };
const base = { firstName: 'Paciente', lastName: 'Prueba' };
function setup(record: Record<string, unknown> = {}) {
  const stored: any = { id: 'patient', tenantId: 'tenant', clinicId: 'clinic', ...base, dateOfBirth: null, ...record };
  const prisma = {
    clinic: { findFirst: jest.fn().mockResolvedValue({ timezone: 'Europe/Madrid' }) },
    patient: {
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'new', ...data })),
      findMany: jest.fn().mockResolvedValue([stored]),
      updateMany: jest.fn().mockImplementation(({ where, data }) => {
        if (where.id !== stored.id || where.tenantId !== stored.tenantId || where.clinicId !== stored.clinicId) return Promise.resolve({ count: 0 });
        Object.assign(stored, data); return Promise.resolve({ count: 1 });
      }),
      findFirstOrThrow: jest.fn().mockResolvedValue(stored)
    }
  };
  return { service: new PatientsService(prisma as any), prisma, stored };
}

beforeEach(() => { jest.useFakeTimers().setSystemTime(new Date('2026-11-05T10:00:00Z')); });
afterEach(() => jest.useRealTimers());

describe('Patient demographics contract', () => {
  const dto = Reflect.getMetadata('design:paramtypes', PatientsController.prototype, 'create')[1];
  const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
  const validate = (value: unknown) => pipe.transform(value, { type: 'body', metatype: dto });

  it('persists postal code as text, locality, province and a manual newborn age', async () => {
    const input = await validate({ ...base, postalCode: '00321', city: 'Localidad', province: 'Provincia', age: 0 });
    const { service, prisma } = setup();
    await expect(service.create(user, input)).resolves.toMatchObject({ postalCode: '00321', city: 'Localidad', province: 'Provincia', age: 0, tenantId: 'tenant', clinicId: 'clinic' });
    expect(prisma.clinic.findFirst).not.toHaveBeenCalled();
  });
  it('accepts older clients without the new optional fields', async () => {
    const { service } = setup();
    await expect(service.create(user, await validate(base))).resolves.toMatchObject(base);
  });
  it('rejects invalid ages, numeric postal codes, invalid dates and timestamps', async () => {
    for (const age of [-1, 1.5, 131, '27']) await expect(validate({ ...base, age })).rejects.toThrow();
    for (const postalCode of [12345, 'x'.repeat(21)]) await expect(validate({ ...base, postalCode })).rejects.toThrow();
    await expect(validate({ ...base, province: 'x'.repeat(121) })).rejects.toThrow();
    for (const dateOfBirth of ['2026-02-30', '2000-01-01T12:00:00Z']) await expect(validate({ ...base, dateOfBirth })).rejects.toThrow();
  });
  it('stores a date without a time and derives age instead of trusting a conflicting age', async () => {
    const { service } = setup();
    const result = await service.create(user, await validate({ ...base, dateOfBirth: '2000-11-05', age: 99 }));
    expect(result).toMatchObject({ age: 26, dateOfBirth: new Date('2000-11-05T00:00:00Z') });
  });
  it('rejects future birth dates and ages over 130 before writing', async () => {
    const { service, prisma } = setup();
    for (const dateOfBirth of ['2026-11-06', '1895-11-05']) await expect(service.create(user, { ...base, dateOfBirth })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.patient.create).not.toHaveBeenCalled();
  });
  it('recalculates age on reads at the birthday in the clinic timezone', async () => {
    const { service, prisma } = setup({ dateOfBirth: new Date('1990-11-06T00:00:00Z'), age: 10 });
    expect((await service.list(user))[0].age).toBe(35);
    jest.setSystemTime(new Date('2026-11-05T23:30:00Z'));
    expect((await service.list(user))[0].age).toBe(36);
    expect(prisma.patient.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: 'tenant', clinicId: 'clinic' } }));
  });
  it('supports clearing optional demographics while keeping the scoped update', async () => {
    const { service, prisma } = setup({ dateOfBirth: new Date('1990-11-06T00:00:00Z'), age: 35 });
    const input = await validate({ ...base, dateOfBirth: null, age: null, postalCode: null, province: null });
    await expect(service.update(user, 'patient', input)).resolves.toMatchObject({ dateOfBirth: null, age: null, postalCode: null, province: null });
    expect(prisma.patient.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'patient', tenantId: 'tenant', clinicId: 'clinic' } }));
    await expect(service.update({ ...user, tenantId: 'another' }, 'patient', input)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('Birth date arithmetic', () => {
  it('handles birthdays, leap days and future or invalid dates', () => {
    expect(patientAgeOnDate('2000-11-06', '2026-11-05')).toBe(25);
    expect(patientAgeOnDate('2000-11-05', '2026-11-05')).toBe(26);
    expect(patientAgeOnDate('2024-02-29', '2025-02-28')).toBe(0);
    expect(patientAgeOnDate('2024-02-29', '2025-03-01')).toBe(1);
    expect(patientAgeOnDate('2026-11-06', '2026-11-05')).toBeNull();
    expect(patientAgeOnDate('2026-02-30', '2026-11-05')).toBeNull();
    expect(clinicToday('Europe/Madrid', new Date('2026-11-05T23:30:00Z'))).toBe('2026-11-06');
  });
});
