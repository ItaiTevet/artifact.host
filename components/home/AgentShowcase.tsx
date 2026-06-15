import { CopyButton } from '@/components/ui/CopyButton';
import { PLATFORMS } from './PlatformLogos';
import styles from './AgentShowcase.module.css';

const COMMANDS = `npx artifact-host auth login
npx artifact-host deploy ./index.html`;

export function AgentShowcase() {
  return (
    <section className={styles.section} aria-labelledby="agents-heading">
      <span className={styles.eyebrow}>Built for agentic workflows</span>
      <h2 id="agents-heading" className={styles.heading}>
        Your agent&rsquo;s last step:<br />a live link.
      </h2>
      <p className={styles.sub}>
        Any AI agent that can run a shell command can publish to a real URL — no API keys,
        nothing to install for whoever you share it with.
      </p>

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
              {p.icon}
              <span>{p.name}</span>
            </span>
          ))}
        </div>
        <p className={styles.caption}>
          Runs anywhere your agent has a terminal — Claude Code, Cursor, Copilot, and more.
        </p>
      </div>
    </section>
  );
}
