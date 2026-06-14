import { Suspense } from 'react';
import CliAuthClient from './CliAuthClient';

export const dynamic = 'force-dynamic';

export default function CliAuthPage() {
  return (
    <Suspense
      fallback={
        <main style={{ fontFamily: 'system-ui', maxWidth: 460, margin: '15vh auto', padding: 24 }}>
          Loading…
        </main>
      }
    >
      <CliAuthClient />
    </Suspense>
  );
}
