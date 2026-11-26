import { jwtSecret } from '../src/auth/jwt-secret';

const originalSecret = process.env.JWT_SECRET;
afterEach(() => { if (originalSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = originalSecret; });

describe('jwtSecret', () => {
  it('rejects a missing or short secret and returns a long one', () => {
    delete process.env.JWT_SECRET;
    expect(() => jwtSecret()).toThrow('JWT_SECRET');
    process.env.JWT_SECRET = 'x'.repeat(31);
    expect(() => jwtSecret()).toThrow('JWT_SECRET');
    process.env.JWT_SECRET = 'y'.repeat(32);
    expect(jwtSecret()).toBe('y'.repeat(32));
  });
});

import { HttpException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { LoginAttempts } from '../src/auth/login-attempts';
import { AuthService } from '../src/auth/auth.service';

jest.mock('bcrypt', () => ({ compare: jest.fn(), hash: jest.fn() }));
const MINUTE = 60_000;

describe('LoginAttempts', () => {
  it('blocks an email after 5 failures and allows it again after 15 minutes', () => {
    const attempts = new LoginAttempts();
    for (let i = 0; i < 4; i++) attempts.recordFailure('a@b.com', 0);
    expect(() => attempts.assertAllowed('a@b.com', 0)).not.toThrow();
    attempts.recordFailure(' A@B.com ', 0);
    let blocked: unknown;
    try { attempts.assertAllowed('a@b.com', MINUTE); } catch (error) { blocked = error; }
    expect(blocked).toBeInstanceOf(HttpException);
    expect((blocked as HttpException).getStatus()).toBe(429);
    expect((blocked as HttpException).message).toContain('Demasiados intentos');
    expect(() => attempts.assertAllowed('A@B.COM', 16 * MINUTE)).not.toThrow();
  });

  it('forgets failures older than the window and after a reset', () => {
    const attempts = new LoginAttempts();
    for (let i = 0; i < 4; i++) attempts.recordFailure('a@b.com', 0);
    attempts.recordFailure('a@b.com', 16 * MINUTE);
    expect(() => attempts.assertAllowed('a@b.com', 16 * MINUTE)).not.toThrow();
    for (let i = 0; i < 4; i++) attempts.recordFailure('c@d.com', 0);
    attempts.reset('C@D.com');
    attempts.recordFailure('c@d.com', 0);
    expect(() => attempts.assertAllowed('c@d.com', 0)).not.toThrow();
  });
});

describe('AuthService.login rate limit', () => {
  const user = { id: 'u', tenantId: 't', clinicId: 'c', email: 'a@b.com', name: 'A', role: 'CLINIC_OWNER', passwordHash: 'h' };
  function setup() {
    const prisma: any = { user: { findUnique: jest.fn().mockResolvedValue(user) } };
    const attempts = new LoginAttempts();
    return { attempts, service: new AuthService(prisma, { sign: jest.fn().mockReturnValue('token') } as any, attempts) };
  }

  it('resets the counter after a correct password', async () => {
    const { service, attempts } = setup();
    (bcrypt.compare as jest.Mock).mockResolvedValue(false);
    for (let i = 0; i < 4; i++) await expect(service.login('a@b.com', 'mala')).rejects.toThrow('Credenciales inválidas');
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    await expect(service.login('a@b.com', 'buena')).resolves.toMatchObject({ accessToken: 'token' });
    attempts.recordFailure('a@b.com');
    expect(() => attempts.assertAllowed('a@b.com')).not.toThrow();
  });

  it('rejects a blocked email without checking the password', async () => {
    const { service } = setup();
    (bcrypt.compare as jest.Mock).mockReset().mockResolvedValue(false);
    for (let i = 0; i < 5; i++) await expect(service.login('a@b.com', 'mala')).rejects.toThrow('Credenciales inválidas');
    (bcrypt.compare as jest.Mock).mockClear();
    await expect(service.login('A@b.com', 'buena')).rejects.toThrow('Demasiados intentos');
    expect(bcrypt.compare).not.toHaveBeenCalled();
  });
});

import { UnauthorizedException } from '@nestjs/common';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';

describe('JwtAuthGuard revocable sessions', () => {
  const account = { id: 'u', tenantId: 't', clinicId: 'c', role: 'RECEPTIONIST', isDeveloper: false };
  function run(payload: any, dbUser: any, devBusiness: any = null) {
    const prisma: any = { user: { findUnique: jest.fn().mockResolvedValue(dbUser) }, developmentBusiness: { findFirst: jest.fn().mockResolvedValue(devBusiness) } };
    const guard = new JwtAuthGuard({ verify: jest.fn().mockReturnValue(payload) } as any, prisma);
    const request: any = { headers: { authorization: 'Bearer token' } };
    const context: any = { switchToHttp: () => ({ getRequest: () => request }) };
    return { result: guard.canActivate(context), request, prisma };
  }

  it('rejects a token whose account no longer exists or has no subject', async () => {
    await expect(run({ sub: 'u', tenantId: 't', clinicId: 'c', role: 'CLINIC_OWNER' }, null).result).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(run({ tenantId: 't', clinicId: 'c', role: 'CLINIC_OWNER' }, account).result).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('uses the current role from the database for the account own business', async () => {
    const { result, request } = run({ sub: 'u', tenantId: 't', clinicId: 'c', role: 'CLINIC_OWNER' }, account);
    await expect(result).resolves.toBe(true);
    expect(request.user).toEqual({ sub: 'u', tenantId: 't', clinicId: 'c', role: 'RECEPTIONIST' });
  });

  it('allows a developer session only in a business the developer still owns', async () => {
    const developer = { ...account, role: 'CLINIC_OWNER', isDeveloper: true };
    const token = { sub: 'u', tenantId: 't2', clinicId: 'c2', role: 'CLINIC_OWNER' };
    const allowed = run(token, developer, { id: 'd' });
    await expect(allowed.result).resolves.toBe(true);
    expect(allowed.request.user).toEqual({ sub: 'u', tenantId: 't2', clinicId: 'c2', role: 'CLINIC_OWNER' });
    expect(allowed.prisma.developmentBusiness.findFirst).toHaveBeenCalledWith({ where: { developerUserId: 'u', clinicId: 'c2', clinic: { tenantId: 't2' } }, select: { id: true } });
    await expect(run(token, developer, null).result).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(run(token, { ...developer, isDeveloper: false }, { id: 'd' }).result).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

describe('review fixes', () => {
  it('rejects the public example secrets even though they are long', () => {
    process.env.JWT_SECRET = 'replace-with-a-long-random-secret';
    expect(() => jwtSecret()).toThrow('JWT_SECRET');
    process.env.JWT_SECRET = 'development-only-secret-change-before-deployment';
    expect(() => jwtSecret()).toThrow('JWT_SECRET');
  });

  it('counts parallel sign-ins before checking passwords', async () => {
    const prisma: any = { user: { findUnique: jest.fn().mockResolvedValue({ id: 'u', passwordHash: 'h' }) } };
    const service = new AuthService(prisma, { sign: jest.fn() } as any, new LoginAttempts());
    (bcrypt.compare as jest.Mock).mockReset().mockResolvedValue(false);
    const results = await Promise.allSettled(Array.from({ length: 8 }, () => service.login('p@q.com', 'mala')));
    const blocked = results.filter(r => r.status === 'rejected' && String((r as PromiseRejectedResult).reason?.message).includes('Demasiados intentos'));
    expect(blocked.length).toBe(3);
    expect(bcrypt.compare).toHaveBeenCalledTimes(5);
  });

  it('keeps a bounded number of tracked emails', () => {
    const attempts = new LoginAttempts();
    for (let i = 0; i < 12_000; i++) attempts.recordFailure(`user${i}@x.com`, 0);
    expect(attempts.size()).toBeLessThanOrEqual(10_000);
  });

  it('rejects overly long emails at the login endpoint', async () => {
    const { ValidationPipe } = await import('@nestjs/common');
    const { AuthController } = await import('../src/auth/auth.controller');
    const dto = Reflect.getMetadata('design:paramtypes', AuthController.prototype, 'login')[0];
    const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
    await expect(pipe.transform({ email: 'a'.repeat(250) + '@b.com', password: 'x' }, { type: 'body', metatype: dto })).rejects.toBeDefined();
  });

  it('drops a developer session once the account is no longer an owner', async () => {
    const prisma: any = { user: { findUnique: jest.fn().mockResolvedValue({ id: 'u', tenantId: 't', clinicId: 'c', role: 'RECEPTIONIST', isDeveloper: true }) }, developmentBusiness: { findFirst: jest.fn().mockResolvedValue({ id: 'd' }) } };
    const guard = new JwtAuthGuard({ verify: jest.fn().mockReturnValue({ sub: 'u', tenantId: 't2', clinicId: 'c2', role: 'CLINIC_OWNER' }) } as any, prisma);
    const context: any = { switchToHttp: () => ({ getRequest: () => ({ headers: { authorization: 'Bearer x' } }) }) };
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
