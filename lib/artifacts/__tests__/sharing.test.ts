import { describe, it, expect } from 'vitest';
import {
  parsePrincipals, formatPrincipals, emailAllowed, serializeAllowlist, deserializeAllowlist,
} from '@/lib/artifacts/sharing';

describe('parsePrincipals', () => {
  it('classifies emails and domains, lowercases, de-dupes', () => {
    const p = parsePrincipals('Alice@Intezer.com, intezer.com\n@partner.com  alice@intezer.com');
    expect(p).toEqual([
      { value: 'alice@intezer.com', type: 'email' },
      { value: 'intezer.com', type: 'domain' },
      { value: 'partner.com', type: 'domain' },
    ]);
  });
  it('ignores blanks', () => {
    expect(parsePrincipals('  ,\n , ')).toEqual([]);
  });
});

describe('formatPrincipals', () => {
  it('round-trips through parse', () => {
    const text = formatPrincipals([
      { value: 'a@b.com', type: 'email' }, { value: 'b.com', type: 'domain' },
    ]);
    expect(text).toBe('a@b.com\n@b.com');
    expect(parsePrincipals(text)).toEqual([
      { value: 'a@b.com', type: 'email' }, { value: 'b.com', type: 'domain' },
    ]);
  });
});

describe('emailAllowed', () => {
  const list = parsePrincipals('alice@intezer.com, @intezer.com');
  it('matches by exact email or domain', () => {
    expect(emailAllowed('alice@intezer.com', list)).toBe(true);
    expect(emailAllowed('BOB@Intezer.com', list)).toBe(true);   // domain match, case-insensitive
    expect(emailAllowed('carol@evil.com', list)).toBe(false);
    expect(emailAllowed(null, list)).toBe(false);
    expect(emailAllowed('alice@intezer.com', [])).toBe(false);
  });
  it('exact-email entry does not allow the whole domain', () => {
    const onlyAlice = parsePrincipals('alice@intezer.com');
    expect(emailAllowed('alice@intezer.com', onlyAlice)).toBe(true);
    expect(emailAllowed('bob@intezer.com', onlyAlice)).toBe(false);
  });
});

describe('serialize/deserialize allowlist', () => {
  it('round-trips and tolerates null/garbage', () => {
    const list = parsePrincipals('a@b.com, @c.com');
    expect(deserializeAllowlist(serializeAllowlist(list))).toEqual(list);
    expect(serializeAllowlist([])).toBeNull();
    expect(deserializeAllowlist(null)).toEqual([]);
    expect(deserializeAllowlist('not json')).toEqual([]);
  });
});
