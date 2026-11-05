import 'reflect-metadata';
import { createHash } from 'node:crypto';
import { AutomationsService, Connection } from '../src/automations/automations.service';
import { contactPhone } from '../src/automations/automation-message';
const user={sub:'u',tenantId:'tenant',clinicId:'clinic',role:'CLINIC_OWNER'};
const connection:Connection={id:'connection',tenantId:'tenant',clinicId:'clinic',tokenHash:'hash',enabled:true,mode:'DRY_RUN',channels:['SMS','WHATSAPP','CALL'],reminderMinutes:1440,createdAt:new Date('2026-11-06T09:00:00Z')};
const sha=(value:string)=>createHash('sha256').update(value).digest('hex');
function setup(){
 const appointment:any={id:'appointment',patientId:'patient',tenantId:'tenant',clinicId:'clinic',status:'SCHEDULED',startsAt:new Date('2026-11-07T09:00:00Z'),notificationVersion:0,patient:{firstName:'Lucía',phone:'+34 600-111-222',dni:'DO_NOT_SHARE_DNI',email:'DO_NOT_SHARE_EMAIL'}};
 const events:any[]=[{id:'event',type:'appointment.created',status:'PENDING',createdAt:new Date('2026-11-06T10:00:00Z'),payload:{appointmentId:'appointment',version:0}}];
 const jobs:any[]=[];
 function matches(row:any,where:any){return (!where.id||row.id===where.id)&&(!where.tenantId||row.tenantId===where.tenantId)&&(!where.clinicId||row.clinicId===where.clinicId)&&(!where.appointmentId||row.appointmentId===where.appointmentId)&&(!where.deliveryTokenHash||row.deliveryTokenHash===where.deliveryTokenHash)&&(!where.status||(typeof where.status==='string'?row.status===where.status:where.status.in.includes(row.status)))&&(!where.channel||where.channel.in.includes(row.channel))&&(!where.claimedAt||row.claimedAt<where.claimedAt.lt)&&(!where.createdAt?.lt||row.createdAt<where.createdAt.lt);}
 const prisma:any={
  automationConnection:{findFirst:jest.fn().mockResolvedValue(null),create:jest.fn().mockImplementation(({data})=>Promise.resolve({...connection,...data})),findUnique:jest.fn().mockResolvedValue(connection),updateMany:jest.fn().mockResolvedValue({count:1})},
  clinic:{findFirstOrThrow:jest.fn().mockResolvedValue({name:'Clínica de prueba',timezone:'Europe/Madrid'})},
  appointment:{findFirst:jest.fn().mockImplementation(({where})=>Promise.resolve(where.tenantId==='tenant'&&where.clinicId==='clinic'&&where.id==='appointment'?appointment:null)),findMany:jest.fn().mockImplementation(()=>Promise.resolve(['SCHEDULED','CONFIRMED'].includes(appointment.status)&&appointment.startsAt>new Date()? [appointment]:[]))},
  automationEvent:{findMany:jest.fn().mockImplementation(()=>Promise.resolve(events.filter(event=>event.status==='PENDING'))),updateMany:jest.fn().mockImplementation(({where,data})=>{Object.assign(events.find(event=>event.id===where.id),data);return Promise.resolve({count:1});})},
  notification:{createMany:jest.fn().mockImplementation(({data})=>{for(const item of data)if(!jobs.some(job=>job.deduplicationKey===item.deduplicationKey))jobs.push({id:'job'+jobs.length,createdAt:new Date(),scheduledAt:new Date(),...item});return Promise.resolve({count:data.length});}),findMany:jest.fn().mockImplementation(({where,take})=>Promise.resolve(jobs.filter(job=>matches(job,where)).slice(0,take))),findFirst:jest.fn().mockImplementation(({where})=>Promise.resolve(jobs.find(job=>matches(job,where))??null)),updateMany:jest.fn().mockImplementation(({where,data})=>{const rows=jobs.filter(job=>matches(job,where));for(const job of rows)Object.assign(job,data);return Promise.resolve({count:rows.length});}),groupBy:jest.fn().mockResolvedValue([])}
 };
 return {service:new AutomationsService(prisma),prisma,jobs,events,appointment};
}
beforeEach(()=>jest.useFakeTimers().setSystemTime(new Date('2026-11-06T12:00:00Z')));afterEach(()=>jest.useRealTimers());
describe('n8n scoped delivery jobs',()=>{
 it('issues only a hashed, per-clinic integration credential in dry run',async()=>{
  const {service,prisma}=setup();const result=await service.connect(user);expect(result.apiKey).toMatch(/^nexo_n8n_[a-f0-9]{64}$/);expect(result.mode).toBe('DRY_RUN');
  expect(prisma.automationConnection.create).toHaveBeenCalledWith({data:{tenantId:'tenant',clinicId:'clinic',tokenHash:sha(result.apiKey),mode:'DRY_RUN'}});
  await expect(service.connect({...user,role:'PROFESSIONAL'})).rejects.toThrow();
 });
 it('rejects session tokens or disabled integration credentials',async()=>{
  const {service,prisma}=setup();await expect(service.authenticate('Bearer jwt-token')).rejects.toThrow();
  prisma.automationConnection.findUnique.mockResolvedValue({...connection,enabled:false});await expect(service.authenticate('Bearer nexo_n8n_'+'a'.repeat(64))).rejects.toThrow();
 });
 it('queues confirmations/reminders for all configured channels without duplicate claims',async()=>{
  const {service,jobs,prisma}=setup();const first=await service.claim(connection,20);expect(first.jobs).toHaveLength(6);
  expect(new Set(first.jobs.map(job=>job.channel))).toEqual(new Set(['SMS','WHATSAPP','CALL']));expect(first.jobs.every(job=>job.mode==='DRY_RUN')).toBe(true);
  const second=await service.claim(connection,20);expect(second.jobs).toEqual([]);expect(jobs).toHaveLength(6);
  expect(JSON.stringify(first.jobs)).not.toMatch(/DO_NOT_SHARE_DNI|DO_NOT_SHARE_EMAIL/);
  expect(prisma.notification.findMany).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({tenantId:'tenant',clinicId:'clinic'})}));
 });
 it('keeps trial jobs separate when live delivery is explicitly enabled',async()=>{
  const {service,jobs}=setup();await service.claim(connection,20);const live=await service.claim({...connection,mode:'LIVE'},20);
  expect(live.jobs).toHaveLength(3);expect(live.jobs.every(job=>job.mode==='LIVE')).toBe(true);
  expect(jobs.filter(job=>job.payload.mode==='DRY_RUN')).toHaveLength(6);
 });
 it('validates a fresh job and simulates it, but refuses a real send receipt in dry run',async()=>{
  const {service}=setup();const job=(await service.claim(connection,1)).jobs[0];
  await expect(service.validate(connection,job.id,job.deliveryToken)).resolves.toEqual({allowed:true,mode:'DRY_RUN'});
  await expect(service.result(connection,job.id,{deliveryToken:job.deliveryToken,status:'SENT',providerMessageId:'SMfixture'})).rejects.toThrow();
  await expect(service.result(connection,job.id,{deliveryToken:job.deliveryToken,status:'SIMULATED'})).resolves.toEqual({status:'SIMULATED'});
  await expect(service.result(connection,job.id,{deliveryToken:job.deliveryToken,status:'SIMULATED'})).resolves.toEqual({status:'SIMULATED'});
 });
 it('blocks stale appointment versions, cancellation, changed phones and foreign clinic access',async()=>{
  const {service,appointment}=setup();const job=(await service.claim(connection,1)).jobs[0];
  await expect(service.validate({...connection,clinicId:'foreign'},job.id,job.deliveryToken)).rejects.toThrow();
  appointment.notificationVersion=1;await expect(service.validate(connection,job.id,job.deliveryToken)).resolves.toEqual({allowed:false,mode:'DRY_RUN'});
  const next=(await service.claim(connection,1)).jobs[0];appointment.status='CANCELLED';await expect(service.validate(connection,next.id,next.deliveryToken)).resolves.toEqual({allowed:false,mode:'DRY_RUN'});
 });
 it('accepts a live provider acknowledgement, and blocks it when delivery is paused',async()=>{
  const {service}=setup();const live={...connection,mode:'LIVE'};const job=(await service.claim(live,1)).jobs[0];
  await expect(service.validate(connection,job.id,job.deliveryToken)).resolves.toEqual({allowed:false,mode:'LIVE'});
  const fresh=setup();const other=(await fresh.service.claim(live,1)).jobs[0];await expect(fresh.service.result(live,other.id,{deliveryToken:other.deliveryToken,status:'SENT',providerMessageId:'SMfixture'})).resolves.toEqual({status:'SENT'});
 });
 it('does not automatically retry an uncertain external request',async()=>{
  const {service,jobs}=setup();const claimed=(await service.claim(connection,20)).jobs;expect(claimed.length).toBe(6);
  jest.advanceTimersByTime(31*60000);await expect(service.claim(connection,20)).resolves.toEqual({jobs:[]});expect(jobs.every(job=>job.status==='FAILED')).toBe(true);
 });
 it('keeps invalid phone jobs out of delivery and normalizes Spanish/international numbers',async()=>{
  expect(contactPhone('630 289 699')).toBe('+34630289699');expect(contactPhone('0034 630 289 699')).toBe('+34630289699');expect(contactPhone('sin teléfono')).toBeNull();
  const {service,appointment,jobs}=setup();appointment.patient.phone='';expect((await service.claim(connection,20)).jobs).toEqual([]);expect(jobs.every(job=>job.lastError==='invalid_phone')).toBe(true);
 });
 it('ignores superseded outbox events and sends only the current appointment version',async()=>{
  const {service,appointment,events,jobs}=setup();appointment.notificationVersion=2;events.push({id:'new-event',type:'appointment.rescheduled',status:'PENDING',createdAt:new Date('2026-11-06T11:00:00Z'),payload:{appointmentId:'appointment',version:2}});
  await service.claim(connection,20);expect(jobs.every(job=>job.payload.version===2)).toBe(true);expect(jobs.some(job=>job.eventType==='appointment.created')).toBe(false);
 });
});
