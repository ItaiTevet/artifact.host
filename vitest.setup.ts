import { config } from 'dotenv';

// Load .env.local so integration tests can reach a real Supabase project.
// Unit tests don't depend on these; the integration suite skips when absent.
config({ path: '.env.local' });

// jsdom (component tests) doesn't implement matchMedia; stub it so components that read it mount.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}
