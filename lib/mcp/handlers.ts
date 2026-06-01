import type { ArtifactRepository } from '@/lib/artifacts/repository';
import { deployArtifact, updateArtifact, setVisibility } from '@/lib/artifacts/service';
import type { Ttl, Visibility } from '@/lib/artifacts/types';

export interface DeployArgs {
  html: string;
  ttl?: Ttl;
  visibility?: Visibility;
  password?: string;
}
export interface DeployOut {
  url: string;
  slug: string;
  edit_token: string;
  expires_at: string;
}

export async function deployHtml(
  repo: ArtifactRepository,
  args: DeployArgs,
  ipHash: string,
): Promise<DeployOut> {
  const r = await deployArtifact(repo, {
    content: args.html,
    ttl: args.ttl,
    visibility: args.visibility,
    password: args.password ?? null,
    ownerId: null,
    ipHash,
  });
  return { url: r.url, slug: r.slug, edit_token: r.editToken, expires_at: r.expiresAt.toISOString() };
}

export interface UpdateArgs {
  slug: string;
  html: string;
  edit_token: string;
}
export interface UpdateOut {
  url: string;
  expires_at: string;
}

export async function updateHtml(
  repo: ArtifactRepository,
  args: UpdateArgs,
): Promise<UpdateOut> {
  const r = await updateArtifact(repo, args.slug, args.html, {
    ownerId: null,
    editToken: args.edit_token,
  });
  return { url: r.url, expires_at: r.expiresAt.toISOString() };
}

export interface VisibilityArgs {
  slug: string;
  visibility: Visibility;
  password?: string;
  edit_token: string;
}
export interface VisibilityOut {
  slug: string;
  visibility: Visibility;
}

export async function setArtifactVisibility(
  repo: ArtifactRepository,
  args: VisibilityArgs,
): Promise<VisibilityOut> {
  await setVisibility(repo, args.slug, args.visibility, args.password ?? null, {
    ownerId: null,
    editToken: args.edit_token,
  });
  return { slug: args.slug, visibility: args.visibility };
}
