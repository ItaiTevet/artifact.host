import { Header } from '@/components/site/Header';
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
            Paste HTML or push it from the CLI. Renders live at a short URL — nothing to install for viewers.
          </p>
        </div>
        <DeployPanel />
      </main>
    </>
  );
}
