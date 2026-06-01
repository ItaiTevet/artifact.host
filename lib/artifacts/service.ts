import type { ArtifactRecord, AuthContext, Ttl, Visibility } from '@/lib/artifacts/types';
import type { ArtifactRepository } from '@/lib/artifacts/repository';
import { ServiceError } from '@/lib/artifacts/errors';
import { validateSize } from '@/lib/artifacts/validate';
import { isTtl, resolveExpiry } from '@/lib/artifacts/ttl';
import { extractTitle } from '@/lib/artifacts/html-meta';
import { generateSlug } from '@/lib/artifacts/slug';
import {
  generateEditToken, hashToken, verifyToken,
  hashPassword, verifyPassword,
} from '@/lib/artifacts/tokens';
import {
  ANON_LIVE_CAP, ACCOUNT_LIVE_CAP, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS,
} from '@/lib/artifacts/constants';

export interface ServiceDeps {
  now(): Date;
  newSlug(): string;
  newEditToken(): string;
  baseUrl: string;
}

export const defaultDeps: ServiceDeps = {
  now: () => new Date(),
  newSlug: generateSlug,
  newEditToken: generateEditToken,
  baseUrl: process.env.APP_BASE_URL ?? 'http://localhost:3000',
};

function urlFor(deps: ServiceDeps, slug: string): string {
  return `${deps.baseUrl.replace(/\/$/, '')}/a/${slug}`;
}

async function uniqueSlug(repo: ArtifactRepository, deps: ServiceDeps): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const slug = deps.newSlug();
    if (!(await repo.slugExists(slug))) return slug;
  }
  throw new ServiceError('rate_limited', 'Could not allocate a unique slug');
}

/** Throws ServiceError('forbidden') unless the auth context is allowed. */
function authorize(record: ArtifactRecord, auth: AuthContext): void {
  const byOwner = !!auth.ownerId && record.ownerId === auth.ownerId;
  const byToken = !!auth.editToken && verifyToken(auth.editToken, record.editTokenHash);
  if (!byOwner && !byToken) {
    throw new ServiceError('forbidden', 'Not authorized to modify this artifact');
  }
}

// ── Deploy ──────────────────────────────────────────────────────────────────

export interface DeployInput {
  content: string;
  visibility?: Visibility;
  password?: string | null;
  ttl?: Ttl;
  ownerId?: string | null;
  ipHash: string;
}

export interface DeployResult {
  slug: string;
  url: string;
  editToken: string;
  expiresAt: Date;
}

export async function deployArtifact(
  repo: ArtifactRepository,
  input: DeployInput,
  deps: ServiceDeps = defaultDeps,
): Promise<DeployResult> {
  const size = validateSize(input.content);
  if (!size.ok) throw new ServiceError('too_large', size.error);

  const ttl = input.ttl ?? '7d';
  if (!isTtl(ttl)) throw new ServiceError('invalid_ttl', `Invalid ttl: ${ttl}`);

  const visibility = input.visibility ?? 'public';
  if (visibility !== 'public' && visibility !== 'password') {
    throw new ServiceError('invalid_visibility', `Invalid visibility: ${visibility}`);
  }
  if (visibility === 'password' && !input.password) {
    throw new ServiceError('password_required', 'A password is required for password visibility');
  }

  const now = deps.now();

  // Rate limit (per IP).
  const since = new Date(now.getTime() - RATE_LIMIT_WINDOW_MS);
  if (await repo.countRecentDeploysByIp(input.ipHash, since) >= RATE_LIMIT_MAX) {
    throw new ServiceError('rate_limited', 'Too many deploys; try again later');
  }

  // Live-artifact cap.
  const ownerId = input.ownerId ?? null;
  const live = ownerId
    ? await repo.countLiveByOwner(ownerId, now)
    : await repo.countLiveByIp(input.ipHash, now);
  const cap = ownerId ? ACCOUNT_LIVE_CAP : ANON_LIVE_CAP;
  if (live >= cap) {
    throw new ServiceError('live_cap_reached', `Live artifact cap reached (${cap})`);
  }

  const slug = await uniqueSlug(repo, deps);
  const editToken = deps.newEditToken();
  const passwordHash = visibility === 'password'
    ? await hashPassword(input.password as string)
    : null;
  const expiresAt = resolveExpiry(ttl, now);

  await repo.insert({
    slug,
    content: input.content,
    title: extractTitle(input.content),
    visibility,
    passwordHash,
    ownerId,
    editTokenHash: hashToken(editToken),
    deployIpHash: input.ipHash,
    expiresAt,
  });

  return { slug, url: urlFor(deps, slug), editToken, expiresAt };
}

// ── Update ──────────────────────────────────────────────────────────────────

export interface UpdateResult {
  slug: string;
  url: string;
  expiresAt: Date; // unchanged from original deploy
}

export async function updateArtifact(
  repo: ArtifactRepository,
  slug: string,
  content: string,
  auth: AuthContext,
  deps: ServiceDeps = defaultDeps,
): Promise<UpdateResult> {
  const record = await repo.findBySlug(slug);
  if (!record) throw new ServiceError('not_found', 'Artifact not found');
  authorize(record, auth);

  const size = validateSize(content);
  if (!size.ok) throw new ServiceError('too_large', size.error);

  await repo.updateContent(slug, content, extractTitle(content));
  return { slug, url: urlFor(deps, slug), expiresAt: record.expiresAt };
}

// ── Visibility ────────────────────────────────────────────────────────────────

export async function setVisibility(
  repo: ArtifactRepository,
  slug: string,
  visibility: Visibility,
  password: string | null,
  auth: AuthContext,
): Promise<{ ok: true }> {
  const record = await repo.findBySlug(slug);
  if (!record) throw new ServiceError('not_found', 'Artifact not found');
  authorize(record, auth);

  if (visibility !== 'public' && visibility !== 'password') {
    throw new ServiceError('invalid_visibility', `Invalid visibility: ${visibility}`);
  }
  if (visibility === 'password' && !password) {
    throw new ServiceError('password_required', 'A password is required for password visibility');
  }

  const passwordHash = visibility === 'password' ? await hashPassword(password as string) : null;
  await repo.updateVisibility(slug, visibility, passwordHash);
  return { ok: true };
}

// ── View ────────────────────────────────────────────────────────────────────

export type ViewResult =
  | { status: 'ok'; content: string; title: string | null; viewCount: number }
  | { status: 'password_required'; title: string | null }
  | { status: 'not_found' };

export async function viewArtifact(
  repo: ArtifactRepository,
  slug: string,
  ctx: { passwordVerified: boolean },
  deps: ServiceDeps = defaultDeps,
): Promise<ViewResult> {
  const record = await repo.findBySlug(slug);
  if (!record) return { status: 'not_found' };
  if (record.expiresAt <= deps.now()) return { status: 'not_found' };

  if (record.visibility === 'password' && !ctx.passwordVerified) {
    return { status: 'password_required', title: record.title };
  }

  await repo.incrementViews(slug);
  return {
    status: 'ok',
    content: record.content,
    title: record.title,
    viewCount: record.viewCount + 1,
  };
}

/** Verify a password attempt against the stored hash for a slug. */
export async function checkPassword(
  repo: ArtifactRepository,
  slug: string,
  password: string,
  deps: ServiceDeps = defaultDeps,
): Promise<boolean> {
  const record = await repo.findBySlug(slug);
  if (!record || record.expiresAt <= deps.now()) return false;
  if (record.visibility !== 'password' || !record.passwordHash) return false;
  return verifyPassword(password, record.passwordHash);
}
