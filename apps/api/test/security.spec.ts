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
