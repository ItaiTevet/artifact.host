export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: Date;
}

/** Local username/password accounts (self-host). On Supabase, identity is managed externally. */
export interface UserRepository {
  findByEmail(email: string): Promise<UserRecord | null>;
  create(email: string, passwordHash: string): Promise<UserRecord>;
  count(): Promise<number>;

  /** Record a login/signup attempt from an IP (for rate limiting). */
  recordAuthAttempt(ipHash: string, at: Date): Promise<void>;
  /** Count this IP's auth attempts at or after `since`. */
  countRecentAuthAttempts(ipHash: string, since: Date): Promise<number>;
}
