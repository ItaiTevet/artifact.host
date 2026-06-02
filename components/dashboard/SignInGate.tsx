'use client';

import { signIn } from '@/lib/web/supabase-browser';
import styles from './SignInGate.module.css';

export function SignInGate({
  title = 'Sign in to your dashboard',
  subtitle = 'Manage the artifacts you’ve deployed while signed in.',
}: { title?: string; subtitle?: string }) {
  return (
    <div className={styles.wrap}>
      <h1 className={styles.title}>{title}</h1>
      <p className={styles.subtitle}>{subtitle}</p>
      <button className={styles.btn} onClick={() => void signIn('google')}>Sign in with Google</button>
      <button className={styles.btn} onClick={() => void signIn('github')}>Sign in with GitHub</button>
    </div>
  );
}
