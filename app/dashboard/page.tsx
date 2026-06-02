import { Header } from '@/components/site/Header';
import { DashboardClient } from '@/components/dashboard/DashboardClient';

export const metadata = { title: 'Dashboard — artifact.host' };

export default function DashboardPage() {
  return (
    <>
      <Header />
      <main><DashboardClient /></main>
    </>
  );
}
