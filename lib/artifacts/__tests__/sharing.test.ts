import { describe, it, expect } from 'vitest';
import { parsePrincipals, formatPrincipals, serializeAllowlist, deserializeAllowlist, emailAllowed, commentAllowed } from '@/lib/artifacts/sharing';

describe('sharing roles', () => {
  it('parsePrincipals defaults role to view', () => {
    expect(parsePrincipals('alice@x.com\n@acme.com')).toEqual([
      { value: 'alice@x.com', type: 'email', role: 'view' },
      { value: 'acme.com', type: 'domain', role: 'view' },
    ]);
  });

  it('deserializeAllowlist back-fills role=view for legacy entries without a role', () => {
    const legacy = JSON.stringify([{ value: 'bob@x.com', type: 'email' }]);
    expect(deserializeAllowlist(legacy)).toEqual([{ value: 'bob@x.com', type: 'email', role: 'view' }]);
  });

  it('serialize → deserialize round-trips role', () => {
    const list = [{ value: 'alice@x.com', type: 'email' as const, role: 'comment' as const }];
    expect(deserializeAllowlist(serializeAllowlist(list))).toEqual(list);
  });

  it('emailAllowed matches any principal regardless of role (view or comment can view)', () => {
    const list = [{ value: 'alice@x.com', type: 'email' as const, role: 'comment' as const }];
    expect(emailAllowed('alice@x.com', list)).toBe(true);
    expect(emailAllowed('nobody@x.com', list)).toBe(false);
  });

  it('commentAllowed is true only for comment-role principals (by email or domain)', () => {
    const list = [
      { value: 'alice@x.com', type: 'email' as const, role: 'comment' as const },
      { value: 'view-only@x.com', type: 'email' as const, role: 'view' as const },
      { value: 'acme.com', type: 'domain' as const, role: 'comment' as const },
    ];
    expect(commentAllowed('alice@x.com', list)).toBe(true);
    expect(commentAllowed('view-only@x.com', list)).toBe(false);
    expect(commentAllowed('someone@acme.com', list)).toBe(true);
    expect(commentAllowed(null, list)).toBe(false);
  });
});

describe('parsePrincipals', () => {
  it('classifies emails and domains, lowercases, de-dupes', () => {
    const p = parsePrincipals('Alice@Intezer.com, intezer.com\n@partner.com  alice@intezer.com');
    expect(p).toEqual([
      { value: 'alice@intezer.com', type: 'email', role: 'view' },
      { value: 'intezer.com', type: 'domain', role: 'view' },
      { value: 'partner.com', type: 'domain', role: 'view' },
    ]);
  });
  it('ignores blanks', () => {
    expect(parsePrincipals('  ,\n , ')).toEqual([]);
  });
});

describe('formatPrincipals', () => {
  it('round-trips through parse', () => {
    const text = formatPrincipals([
      { value: 'a@b.com', type: 'email', role: 'view' }, { value: 'b.com', type: 'domain', role: 'view' },
    ]);
    expect(text).toBe('a@b.com\n@b.com');
    expect(parsePrincipals(text)).toEqual([
      { value: 'a@b.com', type: 'email', role: 'view' }, { value: 'b.com', type: 'domain', role: 'view' },
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
