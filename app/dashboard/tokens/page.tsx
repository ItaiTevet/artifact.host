import { Header } from '@/components/site/Header';
import { TokensClient } from '@/components/dashboard/TokensClient';

export const metadata = { title: 'API tokens — artifact.host' };

export default function TokensPage() {
  return (
    <>
      <Header />
      <main><TokensClient /></main>
    </>
  );
}
