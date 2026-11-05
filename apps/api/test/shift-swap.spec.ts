import { ConflictException, NotFoundException } from '@nestjs/common';
import { prepareShiftSwap, requiresColleagueAgreement } from '../src/scheduling/shift-swap';
import { SchedulingService } from '../src/scheduling/scheduling.service';
const people=[{id:'a',firstName:'Clara',lastName:'Montoro'},{id:'b',firstName:'Elena',lastName:'Pineda'}];
const first={id:'first',professionalId:'a',weekday:1,startsAtMinute:540,endsAtMinute:780,validFrom:'2026-10-01',validTo:'2026-12-31',active:true};
const second={id:'second',professionalId:'b',weekday:2,startsAtMinute:960,endsAtMinute:1200,validFrom:'2026-10-01',validTo:'2026-12-31',active:true};
describe('Colleague shift exchange',()=>{
 it('exchanges different days and hours together, keeping professional identities',()=>{
  const plan=prepareShiftSwap('first','second',[first,second],people);
  expect(plan.map(change=>change.rule?.professionalId)).toEqual(['a','b']);
  expect(plan[0].rule).toMatchObject({weekday:2,startsAtMinute:960,endsAtMinute:1200});
  expect(plan[1].rule).toMatchObject({weekday:1,startsAtMinute:540,endsAtMinute:780});
  expect(plan[0].summary).toContain('Antes: Lunes 09:00–13:00');expect(plan[0].summary).toContain('Después: Martes 16:00–20:00');
  expect(requiresColleagueAgreement(plan)).toBe(true);
 });
 it('also exchanges hours on the same day without false conflicts',()=>{
  const plan=prepareShiftSwap('first','second',[first,{...second,weekday:1}],people);
  expect(plan).toHaveLength(2);expect(plan[0].rule?.startsAtMinute).toBe(960);expect(plan[1].rule?.startsAtMinute).toBe(540);
 });
 it('keeps validity windows explicit and rejects foreign or same-professional rules',()=>{
  const plan=prepareShiftSwap('first','second',[first,{...second,validFrom:'2027-01-01',validTo:'2027-03-31'}],people);
  expect(plan[0].rule?.validFrom).toBe('2027-01-01');expect(plan[0].summary).toContain('2027-03-31');
  expect(()=>prepareShiftSwap('first','foreign',[first,second],people)).toThrow(NotFoundException);
  expect(()=>prepareShiftSwap('first','second',[first,{...second,professionalId:'a'}],people)).toThrow(ConflictException);
 });
 it('requires agreement for removal/replacement exchanges too, but not new assignments',()=>{
  expect(requiresColleagueAgreement([{kind:'remove',ruleId:'first',before:first,summary:'Retirar'},{kind:'create',rule:second,summary:'Asignar'}])).toBe(true);
  expect(requiresColleagueAgreement([{kind:'create',rule:first,summary:'Asignar'},{kind:'create',rule:second,summary:'Asignar'}])).toBe(false);
 });
 it('does not allow a professional to end with overlapping shifts',()=>{
  expect(()=>prepareShiftSwap('first','second',[first,second,{...second,id:'third',professionalId:'a'}],people)).toThrow(ConflictException);
 });
 function setup(fail=false){
  const rows:any[]=[{...first},{...second}];let updates=0;
  const tx:any={professional:{findMany:jest.fn().mockResolvedValue(people)},appointment:{update:jest.fn(),updateMany:jest.fn()},scheduleRule:{
   findMany:jest.fn().mockImplementation(()=>Promise.resolve(rows)),
   updateMany:jest.fn().mockImplementation(({where,data})=>{if(fail&&++updates===2)throw new Error('second write failed');Object.assign(rows.find(row=>row.id===where.id),data);return Promise.resolve({count:1});}),
   findFirstOrThrow:jest.fn().mockImplementation(({where})=>Promise.resolve(rows.find(row=>row.id===where.id)))
  }};
  const prisma:any={...tx,$transaction:jest.fn().mockImplementation(async(fn:any)=>{const before=rows.map(row=>({...row}));try{return await fn(tx);}catch(error){rows.splice(0,rows.length,...before);throw error;}})};
  return {service:new SchedulingService(prisma),rows,prisma};
 }
 const user={sub:'u',tenantId:'tenant',clinicId:'clinic',role:'CLINIC_OWNER'};
 it('applies both changes atomically and never edits patient appointments',async()=>{
  const {service,rows,prisma}=setup();const plan=await service.previewSwap(user,'first','second');
  expect(rows[0].weekday).toBe(1);await service.apply(user,plan,true);
  expect(rows[0].weekday).toBe(2);expect(rows[1].weekday).toBe(1);expect(prisma.appointment.update).not.toHaveBeenCalled();expect(prisma.appointment.updateMany).not.toHaveBeenCalled();
 });
 it('rolls back both changes if either write fails',async()=>{
  const {service,rows}=setup(true);const plan=await service.previewSwap(user,'first','second');
  await expect(service.apply(user,plan,true)).rejects.toThrow('second write failed');expect(rows).toEqual([first,second]);
 });
});
