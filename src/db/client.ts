import { Pool, PoolClient } from 'pg';
import { config } from '../config';

let pool: Pool | null = null;

if (config.databaseUrl) {
  pool = new Pool({ connectionString: config.databaseUrl });
  pool.on('error', (err) => {
    console.error('[DB] Unexpected pool error:', err);
  });
}

/**
 * Run a parameterized query and return rows. Returns [] if DB is not configured or on error.
 */
export async function query<T = Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<T[]> {
  if (!pool) {
    return [];
  }
  try {
    const result = await pool.query(text, params);
    return (result.rows as T[]) ?? [];
  } catch (err) {
    console.error('[DB] Query error:', err);
    throw err;
  }
}

/**
 * Get a dedicated client from the pool. Caller must call client.release() when done.
 * Returns null if DB is not configured.
 */
export async function getClient(): Promise<PoolClient | null> {
  if (!pool) return null;
  return pool.connect();
}

/**
 * Run multiple queries in a single transaction. BEGIN/COMMIT/ROLLBACK and client release are handled.
 * On success returns the value from fn; on error rolls back and rethrows.
 */
export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  if (!pool) {
    throw new Error('Database pool not configured');
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch((rollbackErr) => {
      console.error('[DB] Rollback error:', rollbackErr);
    });
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Whether the database is configured and available.
 */
export function isDbConfigured(): boolean {
  return pool != null;
}
