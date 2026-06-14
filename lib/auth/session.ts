import { SignJWT, jwtVerify } from 'jose';

const ISSUER = 'artifact.host';
const ALG = 'HS256';
const DEFAULT_TTL_S = 30 * 24 * 60 * 60; // 30 days

function secret(): Uint8Array {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 16) {
    throw new Error('AUTH_SECRET (>= 16 chars) is required for local-password/oidc auth');
  }
  return new TextEncoder().encode(s);
}

export interface SessionIdentity {
  userId: string;
  email?: string;
}

/** Mint a first-party session JWT (HS256, signed with AUTH_SECRET). */
export async function issueSession(id: SessionIdentity, ttlSeconds = DEFAULT_TTL_S): Promise<string> {
  return new SignJWT({ email: id.email })
    .setProtectedHeader({ alg: ALG })
    .setSubject(id.userId)
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + ttlSeconds)
    .sign(secret());
}

/** Verify a first-party session JWT; undefined on any failure (fail closed). */
export async function verifySession(token?: string): Promise<SessionIdentity | undefined> {
  if (!token) return undefined;
  try {
    const { payload } = await jwtVerify(token, secret(), { issuer: ISSUER });
    if (typeof payload.sub !== 'string') return undefined;
    return { userId: payload.sub, email: typeof payload.email === 'string' ? payload.email : undefined };
  } catch {
    return undefined;
  }
}
