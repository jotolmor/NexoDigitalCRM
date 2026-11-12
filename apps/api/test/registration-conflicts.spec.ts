import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthService } from '../src/auth/auth.service';
jest.mock('bcrypt', () => ({ hash: jest.fn().mockResolvedValue('fixture-hash') }));
const input = { clinicName: 'Talleres Prueba', specialty: 'Mecánica general', businessType: 'AUTOMOTIVE', name: 'Prueba', email: 'OWNER@EXAMPLE.INVALID', password: 'fixture-password-123' };
function setup() {
  const tx = { tenant: { create: jest.fn().mockResolvedValue({ id:'t' }) }, clinic: { create: jest.fn().mockResolvedValue({id:'c'}) }, user: { create: jest.fn().mockResolvedValue({id:'u',tenantId:'t',clinicId:'c',email:'owner@example.invalid',name:'Prueba',role:'CLINIC_OWNER'}) } };
  const prisma = { user: { findUnique: jest.fn().mockResolvedValue(null) }, tenant: { findUnique: jest.fn().mockResolvedValue(null) }, $transaction: jest.fn().mockImplementation(callback => callback(tx)) };
  const jwt = { sign: jest.fn().mockReturnValue('fixture-token') };
  return { tx, prisma, jwt, service: new AuthService(prisma as any,jwt as any) };
}
describe('registration duplicate conflicts', () => {
  it('rejects an existing email before creating any business or session', async () => {
    const {service,prisma,jwt} = setup();
    prisma.user.findUnique.mockResolvedValue({id:'existing'} as any);
    await expect(service.register(input)).rejects.toThrow('Este correo ya está registrado');
    expect(prisma.user.findUnique).toHaveBeenCalledWith({where:{email:'owner@example.invalid'}});
    expect(prisma.$transaction).not.toHaveBeenCalled(); expect(jwt.sign).not.toHaveBeenCalled();
  });
  it('rejects an existing business slug before creating records', async () => {
    const {service,prisma} = setup();prisma.tenant.findUnique.mockResolvedValue({id:'existing'} as any);
    await expect(service.register(input)).rejects.toThrow('Ya existe un negocio con ese nombre');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it.each([['email','Este correo ya está registrado'],['slug','Ya existe un negocio'],['other','Ya existe una cuenta']])('maps a concurrent unique conflict on %s to HTTP 409',async(target,message)=>{
    const {service,prisma,jwt} = setup();
    prisma.$transaction.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('fixture',{code:'P2002',clientVersion:'fixture',meta:{target:[target]}}));
    let error: unknown;try { await service.register(input); } catch(caught) { error=caught; }
    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getStatus()).toBe(409);
    expect((error as Error).message).toContain(message);
    expect(jwt.sign).not.toHaveBeenCalled();
  });
  it('registers an automotive business with its terminology and normalized email',async()=>{
    const {service,tx} = setup();await expect(service.register(input)).resolves.toMatchObject({accessToken:'fixture-token'});
    expect(tx.user.create).toHaveBeenCalledWith({data:expect.objectContaining({email:'owner@example.invalid',role:'CLINIC_OWNER'})});
    expect(tx.clinic.create).toHaveBeenCalledWith({data:expect.objectContaining({businessType:'AUTOMOTIVE',terminology:expect.objectContaining({customers:'clientes',professionals:'técnicos'})})});
  });
  it('preserves unexpected database failures for server diagnostics',async()=>{
    const {service,prisma} = setup();const failure=new Error('fixture unavailable');prisma.$transaction.mockRejectedValue(failure);
    await expect(service.register(input)).rejects.toBe(failure);
  });
});
