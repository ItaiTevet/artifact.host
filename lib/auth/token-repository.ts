export interface NewToken {
  ownerId: string;
  name: string;
  tokenHash: string;
  expiresAt: Date | null;
}

export interface TokenRecord {
  id: string;
  ownerId: string;
  name: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
}

/** Dashboard/CLI listing projection — never exposes the hash. */
export interface TokenSummary {
  id: string;
  name: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
}

export interface TokenRepository {
  create(rec: NewToken): Promise<TokenRecord>;
  /**
   * Resolve a token hash to its owner id, or null when unknown/expired. Best-effort
   * updates last_used_at. This is the hot path for every PAT-authenticated request.
   */
  resolveOwner(tokenHash: string, now: Date): Promise<string | null>;
  listByOwner(ownerId: string): Promise<TokenSummary[]>;
  revoke(id: string, ownerId: string): Promise<boolean>;
}
