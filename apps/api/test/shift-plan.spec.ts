import { ConflictException, NotFoundException } from '@nestjs/common';
import { prepareShifts, shiftSnapshot, validShift } from '../src/scheduling/shift-plan';
import { SchedulingService } from '../src/scheduling/scheduling.service';
const user = { sub: 'u', tenantId: 'tenant', clinicId: 'clinic', role: 'CLINIC_OWNER' };
const professional = { id: 'pro', firstName: 'Clara', lastName: 'Montoro' };
const rule = { professionalId: 'pro', weekday: 1, startsAtMinute: 540, endsAtMinute: 780, validFrom: '2026-10-01', validTo: '2026-12-31' };
const stored = { ...rule, id: 'rule', active: true };
describe('Shift plan validation', () => {
  it('prepares multiple days and local times without writing', () => {
    const plan = prepareShifts([1,2,3,4,5].map(weekday => ({ kind: 'create', rule: { ...rule, weekday } })), [], [professional]);
    expect(plan).toHaveLength(5);expect(plan[0].summary).toContain('09:00–13:00');
  });
  it('rejects invalid calendar dates and all existing business constraints', () => {
    for (const changes of [{ weekday: 0 }, { startsAtMinute: 555 }, { endsAtMinute: 841 }, { validFrom: '2026-02-30' }, { validTo: '2026-01-01' }, { startsAtMinute: 960, endsAtMinute: 1275 }]) expect(() => validShift({ ...rule, ...changes })).toThrow(ConflictException);
  });
  it('rejects overlap inside the same plan or with current shifts', () => {
    expect(() => prepareShifts([{ kind: 'create', rule }, { kind: 'create', rule }], [], [professional])).toThrow(ConflictException);
    expect(() => prepareShifts([{ kind: 'create', rule }], [stored], [professional])).toThrow(ConflictException);
  });
  it('allows adjacent shifts and separate validity periods', () => {
    expect(prepareShifts([{ kind: 'create', rule: { ...rule, startsAtMinute: 780, endsAtMinute: 840 } }], [stored], [professional])).toHaveLength(1);
    expect(prepareShifts([{ kind: 'create', rule: { ...rule, validFrom: '2027-01-01', validTo: '2027-03-31' } }], [stored], [professional])).toHaveLength(1);
  });
  it('rejects cross-clinic professionals and unknown or repeated rule IDs', () => {
    expect(() => prepareShifts([{ kind: 'create', rule: { ...rule, professionalId: 'foreign' } }], [], [professional])).toThrow(NotFoundException);
    expect(() => prepareShifts([{ kind: 'remove', ruleId: 'foreign' }], [stored], [professional])).toThrow(NotFoundException);
    expect(() => prepareShifts([{ kind: 'remove', ruleId: 'rule' }, { kind: 'update', ruleId: 'rule', rule }], [stored], [professional])).toThrow(ConflictException);
  });
  it('detects stale proposals and supports a replacement plan', () => {
    const plan = prepareShifts([{ kind: 'update', ruleId: 'rule', rule: { ...rule, endsAtMinute: 810 } }], [stored], [professional]);
    expect(plan[0].before).toEqual(shiftSnapshot(stored));
    expect(() => prepareShifts(plan, [{ ...stored, endsAtMinute: 720 }], [professional], true)).toThrow(ConflictException);
    expect(prepareShifts([{ kind: 'remove', ruleId: 'rule' }, { kind: 'create', rule }], [stored], [professional])).toHaveLength(2);
  });
});
describe('Atomic shift changes', () => {
  function setup(failSecond = false) {
    const rows: any[] = [{ ...stored }];let creates = 0;
    const tx: any = { professional: { findMany: jest.fn().mockResolvedValue([professional]) }, scheduleRule: {
      findMany: jest.fn().mockImplementation(() => Promise.resolve(rows.filter(row => row.active))),
      create: jest.fn().mockImplementation(({ data }) => { if (failSecond && ++creates === 2) throw new Error('write failed');const row = { ...data, id: 'new'+rows.length, active: true };rows.push(row);return Promise.resolve(row); }),
      updateMany: jest.fn().mockImplementation(({ where, data }) => {const row=rows.find(r=>r.id===where.id && r.active);if(!row)return Promise.resolve({count:0});Object.assign(row,data);return Promise.resolve({count:1});}),
      findFirstOrThrow: jest.fn().mockImplementation(({where}) => Promise.resolve(rows.find(r=>r.id===where.id)))
    }};
    const prisma: any = { ...tx, $transaction: jest.fn().mockImplementation(async (fn:any) => {const before=rows.map(row=>({...row}));try{return await fn(tx);}catch(error){rows.splice(0,rows.length,...before);throw error;}}) };
    return { service: new SchedulingService(prisma), prisma, rows };
  }
  it('writes a batch in a serializable transaction and preserves appointments', async () => {
    const { service, prisma } = setup();
    const changes = [{kind:'update' as const,ruleId:'rule',rule:{...rule,endsAtMinute:810}},{kind:'create' as const,rule:{...rule,weekday:2}}];
    await expect(service.apply(user, changes)).resolves.toHaveLength(2);
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function),{isolationLevel:'Serializable'});
    expect(prisma.professional.findMany).toHaveBeenCalledWith(expect.objectContaining({where:{tenantId:'tenant',clinicId:'clinic',active:true}}));
  });
  it('rolls back the entire plan when any write fails', async () => {
    const { service, rows } = setup(true);
    await expect(service.apply(user,[{kind:'create',rule:{...rule,weekday:2}},{kind:'create',rule:{...rule,weekday:3}}])).rejects.toThrow('write failed');
    expect(rows).toEqual([stored]);
  });
  it('soft removes a rule and forbids readers from writing', async () => {
    const { service, rows, prisma } = setup();
    await service.removeRule(user,'rule');expect(rows[0].active).toBe(false);
    await expect(service.addRule({...user,role:'PROFESSIONAL'},rule)).rejects.toThrow();
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});
