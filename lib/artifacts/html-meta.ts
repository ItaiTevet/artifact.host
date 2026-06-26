export function extractTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!match) return null;
  const text = match[1].trim();
  return text ? text.slice(0, 200) : null;
}

/** Pull `<meta name="description">` (attributes in any order) for richer share text. */
export function extractDescription(html: string): string | null {
  const tag = html.match(/<meta\s+[^>]*name=["']description["'][^>]*>/i);
  if (!tag) return null;
  const content = tag[0].match(/content=["']([\s\S]*?)["']/i);
  if (!content) return null;
  const text = content[1].trim();
  return text ? text.slice(0, 300) : null;
}
