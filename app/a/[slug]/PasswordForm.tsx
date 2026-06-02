import styles from './gate.module.css';

export function PasswordForm({ slug, error }: { slug: string; error: boolean }) {
  return (
    <div className={styles.wrap}>
      <div className={styles.logo}>artifact<b>.host</b></div>
      <h1 className={styles.h1}>This artifact is password-protected</h1>
      <form method="POST" action={`/a/${slug}/password`}>
        <input className={styles.input} type="password" name="password" placeholder="Password" autoFocus />
        {error && <p className={styles.error}>Incorrect password.</p>}
        <div><button className={styles.btn} type="submit">View artifact</button></div>
      </form>
    </div>
  );
}
