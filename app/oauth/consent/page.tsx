import { Suspense } from 'react';
import ConsentClient from './ConsentClient';

export const dynamic = 'force-dynamic';

export default function ConsentPage() {
  return (
    <Suspense
      fallback={
        <main style={{ fontFamily: 'system-ui', maxWidth: 420, margin: '15vh auto', padding: 24 }}>
          Loading…
        </main>
      }
    >
      <ConsentClient />
    </Suspense>
  );
}
