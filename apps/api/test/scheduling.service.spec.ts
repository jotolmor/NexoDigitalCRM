import { ConflictException } from '@nestjs/common';
import { SchedulingService } from '../src/scheduling/scheduling.service';

const user = { tenantId: 'tenant-a', clinicId: 'clinic-a', role: 'CLINIC_OWNER' };
const baseRule = { professionalId: 'professional-a', weekday: 1, startsAtMinute: 600, endsAtMinute: 810, validFrom: '2026-10-01', validTo: '2026-12-31' };

function makeService(existing: any[] = []) {
  const prisma = {
    professional: { findFirst: jest.fn().mockResolvedValue({ id: 'professional-a' }) },
    scheduleRule: {
      findMany: jest.fn().mockResolvedValue(existing),
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve(data))
    }
  };
  return { service: new SchedulingService(prisma as any), prisma };
}

describe('SchedulingService.addRule', () => {
  it('accepts an hourly start and a 15-minute-aligned end within the morning extension', async () => {
    const { service } = makeService();
    await expect(service.addRule(user, baseRule)).resolves.toMatchObject({ startsAtMinute: 600, endsAtMinute: 810 });
  });

  it('rejects starts that are not on a whole hour', async () => {
    const { service, prisma } = makeService();
    await expect(service.addRule(user, { ...baseRule, startsAtMinute: 555 })).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.professional.findFirst).not.toHaveBeenCalled();
  });

  it('rejects weekends and ends beyond the one-hour extension', async () => {
    const { service } = makeService();
    await expect(service.addRule(user, { ...baseRule, weekday: 6 })).rejects.toBeInstanceOf(ConflictException);
    await expect(service.addRule(user, { ...baseRule, endsAtMinute: 855 })).rejects.toBeInstanceOf(ConflictException);
  });
});
