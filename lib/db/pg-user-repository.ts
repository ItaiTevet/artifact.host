import type { Pool } from 'pg';
import type { UserRecord, UserRepository } from '@/lib/auth/user-repository';
import { AUTH_RATE_LIMIT_WINDOW_MS } from '@/lib/auth/constants';

interface Row { id: string; email: string; password_hash: string; created_at: Date; }

function toRecord(r: Row): UserRecord {
  return { id: r.id, email: r.email, passwordHash: r.password_hash, createdAt: new Date(r.created_at) };
}

export class PgUserRepository implements UserRepository {
  constructor(private pool: Pool) {}

  async findByEmail(email: string): Promise<UserRecord | null> {
    const { rows } = await this.pool.query<Row>('select * from users where email = $1', [email]);
    return rows[0] ? toRecord(rows[0]) : null;
  }

  async create(email: string, passwordHash: string): Promise<UserRecord> {
    const { rows } = await this.pool.query<Row>(
      'insert into users (email, password_hash) values ($1,$2) returning *', [email, passwordHash],
    );
    return toRecord(rows[0]);
  }

  async count(): Promise<number> {
    const { rows } = await this.pool.query<{ n: string }>('select count(*) as n from users');
    return Number(rows[0].n);
  }

  async recordAuthAttempt(ipHash: string, at: Date): Promise<void> {
    await this.pool.query(
      'insert into auth_attempts (ip_hash, created_at) values ($1, $2)', [ipHash, at],
    );
    // Self-prune so the table stays bounded without a dedicated cron.
    const cutoff = new Date(at.getTime() - AUTH_RATE_LIMIT_WINDOW_MS);
    await this.pool.query('delete from auth_attempts where created_at < $1', [cutoff]);
  }

  async countRecentAuthAttempts(ipHash: string, since: Date): Promise<number> {
    const { rows } = await this.pool.query<{ n: string }>(
      'select count(*) as n from auth_attempts where ip_hash = $1 and created_at >= $2', [ipHash, since],
    );
    return Number(rows[0].n);
  }
}
