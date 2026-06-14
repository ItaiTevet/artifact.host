import type { Pool } from 'pg';
import type { UserRecord, UserRepository } from '@/lib/auth/user-repository';

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
}
