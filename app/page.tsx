import { Header } from '@/components/site/Header';
import { ConnectPicker } from '@/components/home/ConnectPicker';
import { DeployPanel } from '@/components/home/DeployPanel';
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
        <div className={styles.divider}>
          <div className={styles.dividerLine} />
          <div className={styles.dividerText}>or paste HTML to try it</div>
          <div className={styles.dividerLine} />
        </div>
        <DeployPanel />
      </main>
    </>
  );
}
