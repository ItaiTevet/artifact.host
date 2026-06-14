import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { UserRecord, UserRepository } from '@/lib/auth/user-repository';

interface Row { id: string; email: string; password_hash: string; created_at: string; }

function toRecord(r: Row): UserRecord {
  return { id: r.id, email: r.email, passwordHash: r.password_hash, createdAt: new Date(r.created_at) };
}

export class SqliteUserRepository implements UserRepository {
  constructor(private db: Database.Database) {}

  async findByEmail(email: string): Promise<UserRecord | null> {
    const r = this.db.prepare('select * from users where email = ?').get(email) as Row | undefined;
    return r ? toRecord(r) : null;
  }

  async create(email: string, passwordHash: string): Promise<UserRecord> {
    const row: Row = {
      id: randomUUID(), email, password_hash: passwordHash, created_at: new Date().toISOString(),
    };
    this.db.prepare(
      'insert into users (id, email, password_hash, created_at) values (@id, @email, @password_hash, @created_at)',
    ).run(row);
    return toRecord(row);
  }

  async count(): Promise<number> {
    const r = this.db.prepare('select count(*) as n from users').get() as { n: number };
    return Number(r.n);
  }
}
