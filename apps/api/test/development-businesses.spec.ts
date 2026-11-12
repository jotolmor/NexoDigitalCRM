import 'reflect-metadata';
import { ForbiddenException, NotFoundException, ValidationPipe } from '@nestjs/common';
import { AuthController } from '../src/auth/auth.controller';
import { AuthService } from '../src/auth/auth.service';
import { DevelopmentController } from '../src/development/development.module';
import { DevelopmentService } from '../src/development/development.service';
jest.mock('bcrypt', () => ({ hash: jest.fn().mockResolvedValue('fixture-hash') }));

const session={sub:'developer',tenantId:'base-tenant',clinicId:'base-clinic',role:'CLINIC_OWNER'};
function setup() {
  const user={id:'developer',email:'dev@example.invalid',name:'Dev',tenantId:'base-tenant',clinicId:'base-clinic',role:'CLINIC_OWNER',isDeveloper:true};
  const clinic={id:'new-clinic',tenantId:'new-tenant',name:'Taller de prueba',businessType:'AUTOMOTIVE'};
  const tx={tenant:{create:jest.fn().mockResolvedValue({id:'new-tenant'})},clinic:{create:jest.fn().mockResolvedValue(clinic)},developmentBusiness:{create:jest.fn().mockResolvedValue({id:'membership'})}};
  const prisma={user:{findUnique:jest.fn().mockResolvedValue(user)},developmentBusiness:{findMany:jest.fn().mockResolvedValue([{clinic}]),findFirst:jest.fn().mockResolvedValue(null)},$transaction:jest.fn().mockImplementation(callback=>callback(tx))};
  const jwt={sign:jest.fn().mockReturnValue('scoped-token')};
  const auth=new AuthService(prisma as any,jwt as any);
  return {prisma,tx,jwt,user,clinic,service:new DevelopmentService(prisma as any,jwt as any,auth)};
}
describe('one-login development businesses',()=>{
  it('rejects ordinary accounts and unauthenticated subjects for every operation',async()=>{
    const {service,prisma}=setup();prisma.user.findUnique.mockResolvedValue({isDeveloper:false,role:'CLINIC_OWNER'} as any);
    await expect(service.list(session)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.create(session,{name:'Demo',businessType:'OTHER',specialty:'Prueba'})).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.select(session,'real-clinic')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.list({...session,sub:undefined})).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.developmentBusiness.findMany).not.toHaveBeenCalled();expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it('lists only the authenticated developer memberships, never all businesses',async()=>{
    const {service,prisma,clinic}=setup();expect(await service.list(session)).toEqual([clinic]);
    expect(prisma.developmentBusiness.findMany).toHaveBeenCalledWith(expect.objectContaining({where:{developerUserId:'developer'}}));
  });
  it('refuses to switch into another developer business or a production clinic',async()=>{
    const {service,prisma,jwt}=setup();
    await expect(service.select(session,'foreign-clinic')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.developmentBusiness.findFirst).toHaveBeenCalledWith({where:{developerUserId:'developer',clinicId:'foreign-clinic'},include:{clinic:true}});
    expect(jwt.sign).not.toHaveBeenCalled();
  });
  it('signs a selected business scope while retaining the same authenticated user',async()=>{
    const {service,prisma,jwt,clinic}=setup();prisma.developmentBusiness.findFirst.mockResolvedValue({clinic} as any);
    const result=await service.select(session,clinic.id);
    expect(jwt.sign).toHaveBeenCalledWith({sub:'developer',tenantId:'new-tenant',clinicId:'new-clinic',role:'CLINIC_OWNER'});
    expect(result.user).toMatchObject({id:'developer',tenantId:'new-tenant',clinicId:'new-clinic',isDeveloper:true});
  });
  it.each(['CLINIC','BEAUTY','FITNESS','EDUCATION','PROFESSIONAL_SERVICES','HOME_SERVICES','AUTOMOTIVE','OTHER'])('creates a separate tenant and owned business for %s',async businessType=>{
    const {service,tx,jwt}=setup();await service.create(session,{name:'  Negocio  ',businessType,specialty:'Actividad',address:' Calle 1 '});
    expect(tx.tenant.create).toHaveBeenCalledWith({data:{name:'Negocio',slug:expect.stringMatching(/^dev-/)}});
    expect(tx.clinic.create).toHaveBeenCalledWith({data:expect.objectContaining({tenantId:'new-tenant',businessType,specialty:'Actividad',address:'Calle 1'})});
    expect(tx.developmentBusiness.create).toHaveBeenCalledWith({data:{developerUserId:'developer',clinicId:'new-clinic'}});
    expect(jwt.sign).toHaveBeenCalledTimes(1);
  });
  it('does not issue a session when transactional membership creation fails',async()=>{
    const {service,tx,jwt}=setup();tx.developmentBusiness.create.mockRejectedValue(new Error('fixture rollback'));
    await expect(service.create(session,{name:'Demo',businessType:'OTHER',specialty:'Actividad'})).rejects.toThrow('fixture rollback');
    expect(jwt.sign).not.toHaveBeenCalled();
  });
  it('does not permit public registration to grant developer access or a supplied tenant',async()=>{
    const pipe=new ValidationPipe({transform:true,whitelist:true,forbidNonWhitelisted:true});
    const registration=Reflect.getMetadata('design:paramtypes',AuthController.prototype,'register')[0];
    await expect(pipe.transform({clinicName:'Demo',specialty:'Actividad',name:'Dev',email:'dev@example.invalid',password:'fixture-password-123',isDeveloper:true},{type:'body',metatype:registration})).rejects.toThrow();
    const create=Reflect.getMetadata('design:paramtypes',DevelopmentController.prototype,'create')[1];
    await expect(pipe.transform({name:'Demo',businessType:'OTHER',specialty:'Actividad',tenantId:'foreign'},{type:'body',metatype:create})).rejects.toThrow();
    await expect(pipe.transform({name:'Demo',businessType:'INVALID',specialty:'Actividad'},{type:'body',metatype:create})).rejects.toThrow();
  });
});
