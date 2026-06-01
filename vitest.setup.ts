import { config } from 'dotenv';

// Load .env.local so integration tests can reach a real Supabase project.
// Unit tests don't depend on these; the integration suite skips when absent.
config({ path: '.env.local' });
