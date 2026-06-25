import { CopyButton } from '@/components/ui/CopyButton';
import { PLATFORMS, faviconUrl } from './PlatformLogos';
import styles from './AgentShowcase.module.css';

const COMMANDS = `npx artifact-host auth login
npx artifact-host deploy ./index.html`;

export function AgentShowcase() {
  return (
    <section className={styles.section} aria-labelledby="agents-heading">
      <h2 id="agents-heading" className={styles.heading}>
        Built for agentic workflows
      </h2>

      <div className={styles.terminal}>
        <div className={styles.termHeader}>
          <span className={styles.dot} aria-hidden="true" />
          <span className={styles.dot} aria-hidden="true" />
          <span className={styles.dot} aria-hidden="true" />
          <span className={styles.termTitle}>agent · terminal</span>
          <CopyButton text={COMMANDS} className={styles.copy} />
        </div>
        <pre className={styles.code}>
          <span className={styles.line}><span className={styles.comment}># from any AI agent&rsquo;s shell</span></span>
          <span className={styles.line}>
            <span className={styles.prompt}>$ </span>npx <span className={styles.pkg}>artifact-host</span> <span className={styles.sub2}>auth login</span>
          </span>
          <span className={styles.line}>
            <span className={styles.prompt}>$ </span>npx <span className={styles.pkg}>artifact-host</span> <span className={styles.sub2}>deploy</span> <span className={styles.path}>./index.html</span>
          </span>
          <span className={styles.line}><span className={styles.out}>→ https://artifact.host/a/x7k2q9</span></span>
        </pre>
      </div>

      <div className={styles.logos}>
        <div className={styles.logoRow}>
          {PLATFORMS.map((p) => (
            <span key={p.name} className={styles.logo} title={p.name}>
              <span className={styles.tile}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={faviconUrl(p.domain)} alt="" width={22} height={22} className={styles.fav} />
              </span>
              <span>{p.name}</span>
            </span>
          ))}
        </div>
        <p className={styles.caption}>
          Runs anywhere your agent has access to a CLI tool — Claude, Cursor, VS Code, and more.
        </p>
      </div>
    </section>
  );
}
