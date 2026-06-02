import { Header } from '@/components/site/Header';
import { EditClient } from '@/components/dashboard/EditClient';

export const metadata = { title: 'Edit — artifact.host' };

export default async function EditPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <>
      <Header />
      <main><EditClient slug={slug} /></main>
    </>
  );
}
