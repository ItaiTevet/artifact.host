import { describe, it, expect } from 'vitest';
import {
  generateEditToken, hashToken, verifyToken,
  hashPassword, verifyPassword,
} from '@/lib/artifacts/tokens';

describe('edit tokens', () => {
  it('generates distinct high-entropy tokens', () => {
    const a = generateEditToken();
    const b = generateEditToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(32);
  });
  it('verifies a token against its hash', () => {
    const t = generateEditToken();
    const h = hashToken(t);
    expect(verifyToken(t, h)).toBe(true);
    expect(verifyToken('wrong-token', h)).toBe(false);
  });
});

describe('passwords', () => {
  it('verifies the correct password and rejects wrong ones', async () => {
    const h = await hashPassword('hunter2');
    expect(await verifyPassword('hunter2', h)).toBe(true);
    expect(await verifyPassword('nope', h)).toBe(false);
  });
  it('produces a different hash each time (salted)', async () => {
    expect(await hashPassword('x')).not.toBe(await hashPassword('x'));
  });
});
