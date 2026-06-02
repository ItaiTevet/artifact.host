import { Header } from '@/components/site/Header';
import { Footer } from '@/components/site/Footer';
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
        {/* CONNECT_PICKER_SLOT (Task 4) */}
        {/* DEPLOY_PANEL_SLOT (Task 6) */}
      </main>
      <Footer />
    </>
  );
}
