import { Pool } from 'pg';
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
 * Whether the database is configured and available.
 */
export function isDbConfigured(): boolean {
  return pool != null;
}
