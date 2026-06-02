import { Header } from '@/components/site/Header';
import { Footer } from '@/components/site/Footer';
import { ConnectPicker } from '@/components/home/ConnectPicker';
import styles from './home.module.css';

export default function Home() {
  return (
    <>
      <Header />
      <main className={styles.main}>
        <div className={styles.hero}>
          <h1 className={styles.headline}>Share what<br />your AI built.</h1>
          <p className={styles.subline}>
            One tool call from your agent. Renders live at a short URL — nothing to install for viewers.
          </p>
        </div>
        <ConnectPicker mcpUrl={`${process.env.APP_BASE_URL ?? 'http://localhost:3000'}/mcp`} />
        {/* DEPLOY_PANEL_SLOT (Task 6) */}
      </main>
      <Footer />
    </>
  );
}
