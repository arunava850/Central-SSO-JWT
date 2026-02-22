/**
 * DB helpers for subject.prospects and subject.registration_journeys.
 */

import { query, withTransaction, isDbConfigured } from './client';

export interface ProspectRow {
  id?: number;
  prospect_id?: number;
  email: string;
  entry_route: string;
  person_uuid: string;
  created_by: string;
  created_at?: string;
}

export interface RegistrationJourneyRow {
  id?: number;
  journey_id?: number;
  prospect_id: number;
  current_step_id: number;
  status: string;
  metadata: unknown;
  created_at?: string;
}

const INSERT_PROSPECT = `
INSERT INTO subject.prospects
(email, entry_route, person_uuid, created_by)
VALUES ($1, $2, gen_random_uuid(), $3)
RETURNING *
`;

/**
 * Insert a prospect. Returns the created row or null if DB not configured or on error.
 */
export async function createProspect(
  email: string,
  entryRoute: string = 'invite',
  createdBy: string = 'system'
): Promise<ProspectRow | null> {
  if (!isDbConfigured()) {
    console.log('[DB] createProspect skipped: DATABASE_URL not set');
    return null;
  }
  try {
    const rows = await query<ProspectRow>(INSERT_PROSPECT, [email, entryRoute, createdBy]);
    return rows?.[0] ?? null;
  } catch (err) {
    console.error('[DB] createProspect failed:', err);
    throw err;
  }
}

const INSERT_REGISTRATION_JOURNEY = `
INSERT INTO subject.registration_journeys
(prospect_id, current_step_id, status, metadata)
VALUES (
  $1,
  (SELECT step_id FROM subject.workflow_steps WHERE step_name = $2),
  $3,
  $4
)
RETURNING *
`;

/**
 * Insert a registration journey for a prospect. step_name defaults to 'OTP_VERIFICATION'.
 * Returns the created row or null if DB not configured or on error.
 */
export async function createRegistrationJourney(
  prospectId: number,
  stepName: string = 'OTP_VERIFICATION',
  status: string = 'IN_PROGRESS',
  metadata: unknown = null
): Promise<RegistrationJourneyRow | null> {
  if (!isDbConfigured()) {
    console.log('[DB] createRegistrationJourney skipped: DATABASE_URL not set');
    return null;
  }
  try {
    const rows = await query<RegistrationJourneyRow>(INSERT_REGISTRATION_JOURNEY, [
      prospectId,
      stepName,
      status,
      metadata ?? null,
    ]);
    return rows?.[0] ?? null;
  } catch (err) {
    console.error('[DB] createRegistrationJourney failed:', err);
    throw err;
  }
}
