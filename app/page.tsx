import { Header } from '@/components/site/Header';
import { AgentShowcase } from '@/components/home/AgentShowcase';
import { DeployPanel } from '@/components/home/DeployPanel';
import { anonymousDeployDisabled } from '@/lib/config/deploy';
import styles from './home.module.css';

export default function Home() {
  return (
    <>
      <Header />
      <main className={styles.main}>
        <div className={styles.hero}>
          <h1 className={styles.headline}>Share what<br />your AI built.</h1>
          <p className={styles.subline}>
            Turn an HTML file into a live, shareable URL in seconds — paste it in the browser or push it from the CLI. Nothing to install for viewers.
          </p>
        </div>
        <AgentShowcase />
        <div className={styles.divider}>
          <div className={styles.dividerLine} />
          <div className={styles.dividerText}>or paste it yourself</div>
          <div className={styles.dividerLine} />
        </div>
        <DeployPanel requireAuth={anonymousDeployDisabled()} />
      </main>
    </>
  );
}
