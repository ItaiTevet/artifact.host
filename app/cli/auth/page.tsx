import { Suspense } from 'react';
import { Header } from '@/components/site/Header';
import CliAuthClient from './CliAuthClient';

export const dynamic = 'force-dynamic';

export default function CliAuthPage() {
  return (
    <>
      <Header />
      <main>
        <Suspense fallback={<p style={{ textAlign: 'center', color: 'var(--ink-3)', padding: '18vh 20px' }}>Loading…</p>}>
          <CliAuthClient />
        </Suspense>
      </main>
    </>
  );
}
