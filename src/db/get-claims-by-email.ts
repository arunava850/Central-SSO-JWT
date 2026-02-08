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
    console.log('[DB] getClaimsByEmail skipped: DATABASE_URL not set');
    return null;
  }
  console.log('[DB] Running persona query for email:', primaryEmail, '(parameter $1)');
  try {
    const rows = await query<PersonaRow>(SQL_BY_EMAIL, [primaryEmail]);
    console.log('[DB] Query returned', rows?.length ?? 0, 'rows');
    if (!rows || rows.length === 0) {
      console.log('[DB] No rows for email, returning null');
      return null;
    }
    rows.forEach((r, i) => {
      console.log('[DB] Row', i + 1, ':', {
        person_id: r.person_id,
        primary_email: r.primary_email,
        display_name: r.display_name,
        user_status: r.user_status,
        app_slug: r.app_slug,
        persona_code: r.persona_code,
        persona_name: r.persona_name,
      });
    });
    const first = rows[0];
    const aud = [...new Set(rows.map((r) => r.app_slug))];
    const apps: Record<string, JWTAppClaims> = {};
    for (const slug of aud) {
      const forApp = rows.filter((r) => r.app_slug === slug);
      const uid = forApp[0].persona_code;
      const roles = forApp.map((r) => r.persona_name);
      apps[slug] = { uid, roles };
    }
    const result = {
      personId: String(first.person_id),
      status: first.user_status ?? 'Active',
      personUuid: String(first.person_id), // JWT identity.Person_uuid from p.person_id
      apps,
      aud,
    };
    console.log('[DB] Mapped claims:', {
      personId: result.personId,
      status: result.status,
      personUuid: result.personUuid,
      aud: result.aud,
      apps: Object.fromEntries(
        Object.entries(result.apps).map(([k, v]) => [k, { uid: v.uid, roles: v.roles }])
      ),
    });
    return result;
  } catch (err) {
    console.error('[DB] getClaimsByEmail failed:', err);
    return null;
  }
}
