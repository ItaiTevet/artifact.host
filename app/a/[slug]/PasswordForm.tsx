export function PasswordForm({ slug, error }: { slug: string; error: boolean }) {
  return (
    <form method="POST" action={`/a/${slug}/password`}
      style={{ maxWidth: 360, margin: '20vh auto', fontFamily: 'system-ui' }}>
      <h1 style={{ fontSize: 18 }}>This artifact is password-protected</h1>
      <input type="password" name="password" placeholder="Password" autoFocus
        style={{ width: '100%', padding: 10, margin: '12px 0' }} />
      {error && <p style={{ color: '#b00' }}>Incorrect password.</p>}
      <button type="submit" style={{ padding: '8px 16px' }}>View artifact</button>
    </form>
  );
}
