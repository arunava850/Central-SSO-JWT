import { query, isDbConfigured } from './client';
import type { ApiUserClaims } from '../auth/claims.helper';
import type { JWTAppClaims } from '../jwt/jwt.service';

/** One row from the persona assignment query */
interface PersonaRow {
  person_id: string;
  primary_email: string;
  display_name: string | null;
  user_status: string | null;
  app_slug: string;
  persona_code: string;
  persona_name: string;
}

const SQL_BY_EMAIL = `
SELECT p.person_id, p.primary_email, p.display_name, p.user_status, pa.app_slug, pa.persona_code, per.persona_name
FROM subject.person p
INNER JOIN subject.persona_assignment pa ON p.person_id = pa.person_id
JOIN subject.personas per ON pa.persona_code = per.persona_id
WHERE p.primary_email = $1
`;

/**
 * Load JWT claims from PostgreSQL by primary email.
 * Returns null if DATABASE_URL is not set, query returns no rows, or on error (after logging).
 */
export async function getClaimsByEmail(primaryEmail: string): Promise<ApiUserClaims | null> {
  if (!isDbConfigured()) {
    return null;
  }
  try {
    const rows = await query<PersonaRow>(SQL_BY_EMAIL, [primaryEmail]);
    if (!rows || rows.length === 0) {
      return null;
    }
    const first = rows[0];
    const aud = [...new Set(rows.map((r) => r.app_slug))];
    const apps: Record<string, JWTAppClaims> = {};
    for (const slug of aud) {
      const forApp = rows.filter((r) => r.app_slug === slug);
      const uid = forApp[0].persona_code;
      const roles = forApp.map((r) => r.persona_name);
      apps[slug] = { uid, roles };
    }
    return {
      personId: String(first.person_id),
      status: first.user_status ?? 'Active',
      personUuid: String(first.person_id), // JWT identity.Person_uuid from p.person_id
      apps,
      aud,
    };
  } catch (err) {
    console.error('[DB] getClaimsByEmail failed:', err);
    return null;
  }
}
