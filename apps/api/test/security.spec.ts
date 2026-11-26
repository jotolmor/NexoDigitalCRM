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
