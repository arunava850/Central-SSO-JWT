import { randomUUID } from 'crypto';
import type { PoolClient } from 'pg';
import { isDbConfigured, withTransaction } from './client';

/** Persona code from Entra Role claim; determines which app_slugs get assigned. */
const PERSONA_APP_SLUGS: Record<string, string[]> = {
  P1001: ['A1001','A1002'], // Artist: Mobile
  P1002: ['A1003', 'A1004'], // Manager: Platform & Key
  P1003: ['A1003', 'A1005'], // Publicist: Platform & Pulse
  P1004: ['A1003', 'A1006', 'A1001'], // Producer: Platform, Aincore, App
};

const DEFAULT_PERSONA = 'P1002';

function normalizePersonaCode(role: string | undefined | null): string {
  if (role != null && typeof role === 'string') {
    const trimmed = role.trim().toUpperCase();
    if (PERSONA_APP_SLUGS[trimmed]) return trimmed;
  }
  return DEFAULT_PERSONA;
}

/**
 * Sync person from Entra: insert into subject.person if not exists,
 * then add persona_assignment rows based on Entra Role claim (one INSERT per persona).
 * Both INSERTs run in a single transaction so they commit together before the callback reads.
 */
export async function syncPersonFromEntra(
  entraId: string,
  email: string,
  name: string,
  personaCodeFromEntra?: string | null
): Promise<{ person_id: string } | null> {
  const emailTrimmed = typeof email === 'string' ? email.trim() : '';
  console.log('[DB] syncPersonFromEntra called: entraId=', entraId, 'primary_email(param)=', email === '' ? '(empty string)' : email?.substring(0, 3) + '***', 'length=', email?.length ?? 0, 'display_name=', (name ?? email) === '' ? '(empty)' : '(set)');
  if (emailTrimmed === '') {
    console.warn('[DB] syncPersonFromEntra: email is empty; primary_email in DB may be empty or null');
  }
  if (!isDbConfigured()) {
    console.log('[DB] syncPersonFromEntra skipped: DATABASE_URL not set');
    return null;
  }
  try {
    return await withTransaction(async (client: PoolClient) => {
      const personUuid = randomUUID().replace(/-/g, ''); // 32-char UUID, no hyphens
      const primaryEmailInsert = email;
      const displayNameInsert = name ?? email;
      console.log('[DB] syncPersonFromEntra INSERT: $3 primary_email=', primaryEmailInsert === '' ? '(empty string)' : primaryEmailInsert.substring(0, 5) + '***', '$4 display_name=', displayNameInsert === '' ? '(empty)' : displayNameInsert.substring(0, 10) + (displayNameInsert.length > 10 ? '...' : ''));
      const insertPersonSql = `
        INSERT INTO subject.person (person_id, entra_id, primary_email, display_name, user_status, created_from_source, created_at, updated_at)
        VALUES ($1, $2, $3, $4, 'Active', 'central-auth', now(), now())
        ON CONFLICT (entra_id) DO NOTHING
        RETURNING person_id
      `;
      const personResult = await client.query(insertPersonSql, [
        personUuid,
        entraId,
        primaryEmailInsert,
        displayNameInsert,
      ]);
      const insertResult = (personResult.rows ?? []) as { person_id: string }[];

      if (!insertResult.length) {
        console.log('[DB] syncPersonFromEntra: person already exists for entra_id', entraId);
        return null;
      }

      const personId = insertResult[0].person_id;
      console.log('[DB] syncPersonFromEntra: created person', personId, 'for', email);

      const personaCode = normalizePersonaCode(personaCodeFromEntra);
      const appSlugs = PERSONA_APP_SLUGS[personaCode];
      if (!appSlugs || appSlugs.length === 0) {
        console.log('[DB] syncPersonFromEntra: no app_slugs for persona', personaCode);
        return { person_id: personId };
      }

      const assignmentIds = appSlugs.map(() => randomUUID().replace(/-/g, ''));
      const insertPersonaSql = `
        INSERT INTO subject.persona_assignment (assignment_id, person_id, persona_code, app_slug, created_at, created_by)
        VALUES ${appSlugs.map((_, i) => `($${4 * i + 1}, $${4 * i + 2}, $${4 * i + 3}, $${4 * i + 4}, now(), 'central-auth')`).join(', ')}
      `;
      const personaParams = appSlugs.flatMap((slug, i) => [assignmentIds[i], personId, personaCode, slug]);
      try {
        await client.query(insertPersonaSql, personaParams);
        console.log('[DB] syncPersonFromEntra: added persona_assignment', personaCode, appSlugs, 'for person', personId);
      } catch (personaErr) {
        console.error('[DB] syncPersonFromEntra: persona_assignment insert failed', {
          personId,
          personaCode,
          appSlugs,
          error: personaErr instanceof Error ? personaErr.message : String(personaErr),
          stack: personaErr instanceof Error ? personaErr.stack : undefined,
        });
        throw personaErr;
      }

      return { person_id: personId };
    });
  } catch (err) {
    console.error('[DB] syncPersonFromEntra failed:', err);
    throw err;
  }
}
