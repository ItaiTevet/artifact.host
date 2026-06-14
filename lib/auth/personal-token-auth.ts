import type { TokenRepository } from '@/lib/auth/token-repository';
import { hashPersonalToken, isPersonalToken } from '@/lib/auth/personal-token';

export interface PersonalTokenAuthDeps {
  repo: TokenRepository;
  now?: () => Date;
}

/**
 * Build a bearer-token verifier that resolves a Personal API Token to its owner id, or
 * undefined for non-PAT / unknown / expired tokens. Composes alongside the session-JWT
 * verifier so the same Authorization header works for both.
 */
export function makeVerifyPersonalToken({ repo, now = () => new Date() }: PersonalTokenAuthDeps) {
  return async function verifyPersonalToken(bearerToken?: string): Promise<string | undefined> {
    if (!isPersonalToken(bearerToken)) return undefined;
    return (await repo.resolveOwner(hashPersonalToken(bearerToken), now())) ?? undefined;
  };
}
