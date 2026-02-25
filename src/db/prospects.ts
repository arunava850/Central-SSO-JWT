/**
 * DB helpers for subject.prospects and subject.registration_journeys.
 */

import { query, isDbConfigured } from './client';

export interface ProspectRow {
  id?: number;
  prospect_id?: number;
  email: string;
  entry_route: string;
  person_uuid: string;
  created_by: string;
  created_at?: string;
  updated_at?: string;
}

export interface RegistrationJourneyRow {
  journey_id?: number;
  prospect_id: number;
  current_step_id: number;
  status: string;
  metadata: unknown;
  started_at?: string;
  updated_at?: string;
}

/** Options for createProspect. person_uuid is optional; mode controls insert vs update by email. */
export interface CreateProspectOptions {
  entry_route?: string;
  created_by?: string;
  /** Optional. Never auto-generated; when omitted or blank (null or ""), stored as NULL. */
  person_uuid?: string | null;
  /** 'insert': insert new or upsert by email (update existing row with same email). 'update': update existing row by email only (no insert). */
  mode?: 'insert' | 'update';
}

/** Insert (or upsert when email exists). person_uuid is never auto-generated; use $4 (may be null). Requires UNIQUE on subject.prospects(email). */
const INSERT_PROSPECT = `
INSERT INTO subject.prospects
(email, entry_route, person_uuid, created_by)
VALUES ($1, $2, $4::uuid, $3)
ON CONFLICT (email) DO UPDATE SET
  entry_route = EXCLUDED.entry_route,
  person_uuid = EXCLUDED.person_uuid,
  created_by = EXCLUDED.created_by,
  updated_at = now()
RETURNING *
`;

/** Update existing prospect by email. $5 = use_default_uuid: when true keep existing person_uuid, when false set to $3 (may be null). Returns null if no row matches. */
const UPDATE_PROSPECT_BY_EMAIL = `
UPDATE subject.prospects
SET
  entry_route = COALESCE($2, entry_route),
  person_uuid = CASE WHEN $5 THEN person_uuid ELSE $3::uuid END,
  created_by = COALESCE($4, created_by),
  updated_at = now()
WHERE email = $1
RETURNING *
`;

const SELECT_PROSPECT_BY_EMAIL = `
SELECT * FROM subject.prospects
WHERE email = $1
`;

/**
 * Insert or update a prospect by email.
 * - mode 'insert' (default): INSERT or, if row with same email exists (unique on email), UPDATE that row.
 * - mode 'update': UPDATE existing row by email; returns null if no row found.
 * person_uuid is optional; never auto-generated. When omitted or blank, stored as NULL. On update, when omitted keeps existing value.
 * Returns the created/updated row or null if DB not configured, or (update mode) no row matched.
 */
export async function createProspect(
  email: string,
  entryRoute: string = 'invite',
  createdBy: string = 'system',
  options: CreateProspectOptions = {}
): Promise<ProspectRow | null> {
  if (!isDbConfigured()) {
    console.log('[DB] createProspect skipped: DATABASE_URL not set');
    return null;
  }
  const {
    entry_route = entryRoute,
    created_by = createdBy,
    person_uuid: personUuidOpt = undefined,
    mode = 'insert',
  } = options;

  const emailTrimmed = email.trim().toLowerCase();
  const personUuidBlank = personUuidOpt === null || personUuidOpt === '' || (typeof personUuidOpt === 'string' && personUuidOpt.trim() === '');
  const useDefaultUuid = personUuidOpt === undefined;
  const personUuidValue = useDefaultUuid || personUuidBlank ? null : personUuidOpt!.trim();

  try {
    if (mode === 'update') {
      const rows = await query<ProspectRow>(UPDATE_PROSPECT_BY_EMAIL, [
        emailTrimmed,
        entry_route,
        personUuidValue,
        created_by,
        useDefaultUuid,
      ]);
      const row = rows?.[0] ?? null;
      console.log('[DB] createProspect(update) params:', { email: emailTrimmed.substring(0, 3) + '***', entry_route, created_by });
      console.log('[DB] createProspect(update) returned:', row ? { prospect_id: row.prospect_id ?? row.id, email: row.email?.substring(0, 3) + '***' } : null);
      return row;
    }
    const rows = await query<ProspectRow>(INSERT_PROSPECT, [
      emailTrimmed,
      entry_route,
      created_by,
      personUuidValue,
    ]);
    const row = rows?.[0] ?? null;
    console.log('[DB] createProspect(insert) params:', { email: emailTrimmed.substring(0, 3) + '***', entry_route, created_by, mode });
    console.log('[DB] createProspect(insert) returned:', row ? { prospect_id: row.prospect_id ?? row.id, email: row.email?.substring(0, 3) + '***' } : null);
    return row;
  } catch (err) {
    console.error('[DB] createProspect failed:', err);
    throw err;
  }
}

/**
 * Get a prospect by email. Email is normalized (trimmed, lowercased).
 * Returns the row or null if DB not configured, not found, or on error.
 */
export async function getProspectByEmail(email: string): Promise<ProspectRow | null> {
  if (!isDbConfigured()) {
    console.log('[DB] getProspectByEmail skipped: DATABASE_URL not set');
    return null;
  }
  try {
    const emailTrimmed = email.trim().toLowerCase();
    console.log('[DB] getProspectByEmail params:', { email: emailTrimmed.substring(0, 3) + '***' });
    const rows = await query<ProspectRow>(SELECT_PROSPECT_BY_EMAIL, [emailTrimmed]);
    const row = rows?.[0] ?? null;
    console.log('[DB] getProspectByEmail returned:', row ? { prospect_id: row.prospect_id ?? row.id, email: row.email?.substring(0, 3) + '***' } : null);
    return row;
  } catch (err) {
    console.error('[DB] getProspectByEmail failed:', err);
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

/** Insert registration journey by numeric step_id (no workflow_steps lookup). */
const INSERT_REGISTRATION_JOURNEY_BY_STEP_ID = `
INSERT INTO subject.registration_journeys
(prospect_id, current_step_id, status, metadata)
VALUES ($1, $2, $3, $4)
RETURNING *
`;

const SELECT_REGISTRATION_JOURNEYS_BY_PROSPECT_ID = `
SELECT * FROM subject.registration_journeys
WHERE prospect_id = $1
ORDER BY started_at
`;

/** Latest journey by prospect (by started_at). */
const SELECT_LATEST_REGISTRATION_JOURNEY_BY_PROSPECT_ID = `
SELECT * FROM subject.registration_journeys
WHERE prospect_id = $1
ORDER BY started_at DESC NULLS LAST
LIMIT 1
`;

const SELECT_STEP_NAME_BY_STEP_ID = `
SELECT step_name FROM subject.workflow_steps
WHERE sequence_order = $1
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

/**
 * Insert a registration journey for a prospect by numeric step_id (no step_name lookup).
 * Use when step ids (e.g. 10, 20) are known and workflow_steps may not have matching step_name.
 * Returns the created row or null if DB not configured or on error.
 */
export async function createRegistrationJourneyByStepId(
  prospectId: number,
  stepId: number,
  status: string = 'IN_PROGRESS',
  metadata: unknown = null
): Promise<RegistrationJourneyRow | null> {
  if (!isDbConfigured()) {
    console.log('[DB] createRegistrationJourneyByStepId skipped: DATABASE_URL not set');
    return null;
  }
  try {
    console.log('[DB] createRegistrationJourneyByStepId params:', { prospectId, stepId, status });
    const rows = await query<RegistrationJourneyRow>(INSERT_REGISTRATION_JOURNEY_BY_STEP_ID, [
      prospectId,
      stepId,
      status,
      metadata ?? null,
    ]);
    const row = rows?.[0] ?? null;
    console.log('[DB] createRegistrationJourneyByStepId returned:', row ? { journey_id: row.journey_id, prospect_id: row.prospect_id, current_step_id: row.current_step_id, status: row.status } : null);
    return row;
  } catch (err) {
    console.error('[DB] createRegistrationJourneyByStepId failed:', err);
    throw err;
  }
}

/**
 * Returns an array of rows (empty if none), or empty array if DB not configured or on error.
 */
export async function getRegistrationJourneysByProspectId(
  prospectId: number
): Promise<RegistrationJourneyRow[]> {
  if (!isDbConfigured()) {
    console.log('[DB] getRegistrationJourneysByProspectId skipped: DATABASE_URL not set');
    return [];
  }
  try {
    const rows = await query<RegistrationJourneyRow>(SELECT_REGISTRATION_JOURNEYS_BY_PROSPECT_ID, [
      prospectId,
    ]);
    return rows ?? [];
  } catch (err) {
    console.error('[DB] getRegistrationJourneysByProspectId failed:', err);
    throw err;
  }
}

/**
 * Returns the latest registration journey for a prospect (by started_at DESC, then id DESC).
 * Returns null if DB not configured, no row found, or on error.
 */
export async function getLatestRegistrationJourneyByProspectId(
  prospectId: number
): Promise<RegistrationJourneyRow | null> {
  if (!isDbConfigured()) {
    console.log('[DB] getLatestRegistrationJourneyByProspectId skipped: DATABASE_URL not set');
    return null;
  }
  try {
    console.log('[DB] getLatestRegistrationJourneyByProspectId params:', { prospectId });
    const rows = await query<RegistrationJourneyRow>(SELECT_LATEST_REGISTRATION_JOURNEY_BY_PROSPECT_ID, [
      prospectId,
    ]);
    const row = rows?.[0] ?? null;
    console.log('[DB] getLatestRegistrationJourneyByProspectId returned:', row ? { journey_id: row.journey_id, prospect_id: row.prospect_id, current_step_id: row.current_step_id, status: row.status, started_at: row.started_at } : null);
    return row;
  } catch (err) {
    console.error('[DB] getLatestRegistrationJourneyByProspectId failed:', err);
    return null;
  }
}

/** Row shape for step_name query */
interface WorkflowStepNameRow {
  step_name?: string;
}

/**
 * Returns the step_name for a given step_id from subject.workflow_steps.
 * Returns null if DB not configured, no row found, or on error.
 */
export async function getStepNameByStepId(stepId: number): Promise<string | null> {
  if (!isDbConfigured()) {
    console.log('[DB] getStepNameByStepId skipped: DATABASE_URL not set');
    return null;
  }
  try {
    console.log('[DB] getStepNameByStepId params:', { stepId });
    const rows = await query<WorkflowStepNameRow>(SELECT_STEP_NAME_BY_STEP_ID, [stepId]);
    const name = rows?.[0]?.step_name;
    const result = name != null && String(name).trim() !== '' ? String(name).trim() : null;
    console.log('[DB] getStepNameByStepId returned:', result ?? null);
    return result;
  } catch (err) {
    console.error('[DB] getStepNameByStepId failed:', err);
    return null;
  }
}

const DELETE_REGISTRATION_JOURNEY_BY_ID = `
DELETE FROM subject.registration_journeys
WHERE journey_id = $1
RETURNING *
`;

/**
 * Delete a registration journey by its primary key (journey_id).
 * Returns the deleted row or null if DB not configured, not found, or on error.
 */
export async function deleteRegistrationJourney(journeyId: number): Promise<RegistrationJourneyRow | null> {
  if (!isDbConfigured()) {
    console.log('[DB] deleteRegistrationJourney skipped: DATABASE_URL not set');
    return null;
  }
  try {
    const rows = await query<RegistrationJourneyRow>(DELETE_REGISTRATION_JOURNEY_BY_ID, [journeyId]);
    return rows?.[0] ?? null;
  } catch (err) {
    console.error('[DB] deleteRegistrationJourney failed:', err);
    throw err;
  }
}
