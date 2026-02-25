/**
 * APIs for prospects and registration journeys.
 * POST /prospects - Create a prospect
 * POST /registration-journeys - Create a registration journey for a prospect
 */

import { Request, Response } from 'express';
import { createProspect, createRegistrationJourney } from './db/prospects';
import { isDbConfigured } from './db/client';

/**
 * POST /prospects
 * Body: { email: string, entry_route?: string, created_by?: string }
 */
export async function postProspect(req: Request, res: Response): Promise<void> {
  try {
    if (!isDbConfigured()) {
      res.status(503).json({
        error: 'service_unavailable',
        error_description: 'Database is not configured',
      });
      return;
    }
    const body = req.body as { email?: string; entry_route?: string; created_by?: string };
    const email = body?.email;
    if (!email || typeof email !== 'string' || !email.trim()) {
      res.status(400).json({ error: 'email is required' });
      return;
    }
    const entryRoute = (body.entry_route && String(body.entry_route).trim()) || 'invite';
    const createdBy = (body.created_by && String(body.created_by).trim()) || 'system';

    const row = await createProspect(email.trim().toLowerCase(), entryRoute, createdBy);
    if (!row) {
      res.status(500).json({
        error: 'create_failed',
        error_description: 'Failed to create prospect',
      });
      return;
    }
    const prospectId = (row as { id?: number; prospect_id?: number }).id ?? (row as { prospect_id?: number }).prospect_id;
    res.status(201).json({
      prospect_id: prospectId,
      id: prospectId,
      email: row.email,
      entry_route: row.entry_route,
      person_uuid: row.person_uuid,
      created_by: row.created_by,
      created_at: row.created_at,
    });
  } catch (error) {
    console.error('[PROSPECTS] postProspect error:', error instanceof Error ? error.message : error);
    res.status(500).json({
      error: 'server_error',
      error_description: 'Failed to create prospect',
    });
  }
}

/**
 * POST /registration-journeys
 * Body: { prospect_id: number, step_name?: string, status?: string, metadata?: object }
 */
export async function postRegistrationJourney(req: Request, res: Response): Promise<void> {
  try {
    if (!isDbConfigured()) {
      res.status(503).json({
        error: 'service_unavailable',
        error_description: 'Database is not configured',
      });
      return;
    }
    const body = req.body as { prospect_id?: number; step_name?: string; status?: string; metadata?: unknown };
    const prospectId = body?.prospect_id;
    if (prospectId == null || typeof prospectId !== 'number' || prospectId < 1) {
      res.status(400).json({ error: 'prospect_id is required and must be a positive number' });
      return;
    }
    const stepName = (body.step_name && String(body.step_name).trim()) || 'OTP_VERIFICATION';
    const status = (body.status && String(body.status).trim()) || 'IN_PROGRESS';
    const metadata = body.metadata ?? null;

    const row = await createRegistrationJourney(prospectId, stepName, status, metadata);
    if (!row) {
      res.status(500).json({
        error: 'create_failed',
        error_description: 'Failed to create registration journey (check prospect_id and workflow_steps)',
      });
      return;
    }
    const journeyId = (row as { journey_id?: number }).journey_id;
    res.status(201).json({
      journey_id: journeyId,
      id: journeyId,
      prospect_id: row.prospect_id,
      current_step_id: row.current_step_id,
      status: row.status,
      metadata: row.metadata,
      started_at: row.started_at,
    });
  } catch (error) {
    console.error('[REGISTRATION_JOURNEYS] postRegistrationJourney error:', error instanceof Error ? error.message : error);
    res.status(500).json({
      error: 'server_error',
      error_description: 'Failed to create registration journey',
    });
  }
}
