'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getAccountEmail, signOut } from '@/lib/web/auth';
import styles from './AccountMenu.module.css';

export function AccountMenu() {
  const [email, setEmail] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    getAccountEmail().then((e) => { if (active) { setEmail(e); setReady(true); } });
    return () => { active = false; };
  }, []);

  async function doSignOut() {
    await signOut();
    setEmail(null);
    window.location.href = '/';
  }

  if (!ready) return <span className={styles.placeholder} aria-hidden="true" />;

  if (!email) {
    return <Link href="/dashboard" className={styles.link}>sign in</Link>;
  }

  return (
    <span className={styles.account}>
      <Link href="/dashboard" className={styles.link}>dashboard</Link>
      <span className={styles.email}>{email}</span>
      <button className={styles.signout} onClick={() => void doSignOut()}>sign out</button>
    </span>
  );
}
