import { getArtifactRepository } from '@/lib/db/factory';
import { extractDescription } from '@/lib/artifacts/html-meta';

export interface OgInfo {
  title: string | null;
  description: string | null;
}

/**
 * Public-only Open Graph details for an artifact's share preview.
 *
 * Returns null for missing, expired, or non-public (password/restricted)
 * artifacts so their title and description never leak through the public
 * unfurl surface (page metadata + the OG image endpoint, both reachable by
 * anyone holding the URL). Non-public links fall back to the generic brand
 * card and boilerplate text.
 */
export async function publicOgInfo(slug: string): Promise<OgInfo | null> {
  try {
    const repo = await getArtifactRepository();
    const rec = await repo.findBySlug(slug);
    if (!rec || rec.expiresAt <= new Date()) return null;
    if (rec.visibility !== 'public') return null;
    return { title: rec.title, description: extractDescription(rec.content) };
  } catch {
    return null;
  }
}
