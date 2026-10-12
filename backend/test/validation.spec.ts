import { parseBody } from '../src/common/zod.pipe';
import { registerSchema } from '@bundle/shared';

describe('parseBody', () => {
  it('rejects underage-shaped payloads only via service (schema passes, service gates)', () => {
    const dto = {
      username: 'tester_01',
      email: 't@example.com',
      password: 'Aa12345678',
      birthDate: '2000-01-01',
      gender: 'MALE',
      acceptedTermsAt: new Date().toISOString(),
    };
    expect(() => parseBody(registerSchema, dto)).not.toThrow();
  });
  it('rejects invalid payloads with 400', () => {
    expect(() => parseBody(registerSchema, { username: 'x' })).toThrow();
  });
});
