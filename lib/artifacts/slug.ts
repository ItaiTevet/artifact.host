import { customAlphabet } from 'nanoid';

// Lowercase letters + digits, excluding ambiguous 0 1 o l i.
export const SLUG_ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz';
const nano = customAlphabet(SLUG_ALPHABET, 7);

export function generateSlug(): string {
  return nano();
}
