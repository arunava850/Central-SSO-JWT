/**
 * Sign-up flow APIs for Entra External ID Native Authentication.
 * POST /auth/signup/start - Initiate sign-up and send OTP to email
 * POST /auth/signup/verify-otp - Verify OTP only (step 1 of split flow)
 * POST /auth/signup/submit-password - Submit password and complete sign-up (step 2 of split flow)
 * POST /auth/signup/complete - Complete sign-up with OTP and password in one call, issue platform JWT
 */

import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { JWTService } from '../jwt/jwt.service';
import { buildUserClaims } from './claims.helper';
import { getClaimsByEmail } from '../db/get-claims-by-email';
import { syncPersonFromEntra } from '../db/sync-person-from-entra';
import { createRefreshToken, storeSignupContinuationToken, getSignupContinuationToken, storePostOtpContinuationToken, getPostOtpContinuationToken } from './token.store';
import { getProspectByEmail, createProspect, createRegistrationJourneyByStepId, getLatestRegistrationJourneyByProspectId, getStepNameByStepId } from '../db/prospects';
import type { IdpUserInfo } from './claims.helper';

const jwtService = new JWTService();

const CHALLENGE_TYPE_SIGNUP = 'oob password redirect';

/** Default Role extension attribute when ENTRA_ROLE_EXTENSION_ATTRIBUTE is not set */
const DEFAULT_ROLE_EXTENSION_ATTRIBUTE = 'extension_5ea66064c5ae4d17801f2ea1b1c00fda_Role';

function getRoleExtensionAttribute(): string {
  return config.entraRoleExtensionAttribute?.trim() || DEFAULT_ROLE_EXTENSION_ATTRIBUTE;
}

/** Native Auth API response: start / challenge / continue */
interface NativeAuthContinuationResponse {
  continuation_token?: string;
  challenge_type?: string;
  error?: string;
  error_description?: string;
  continuation_token_new?: string;
}

/** Native Auth /token response */
interface NativeAuthTokenResponse {
  access_token?: string;
  id_token?: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  error?: string;
  error_description?: string;
}

/** Id token payload (Entra) */
interface EntraIdTokenPayload {
  sub?: string;
  oid?: string;
  email?: string;
  preferred_username?: string;
  name?: string;
  given_name?: string;
  Persona?: string;
  persona?: string;
}

function getCiamBaseUrl(): string | null {
  const tenantName = config.tenantName;
  if (!tenantName || !tenantName.trim()) return null;
  return `https://${tenantName.trim()}.ciamlogin.com/${tenantName.trim()}.onmicrosoft.com`;
}

function redactBodyForLog(body: Record<string, string>): Record<string, string> {
  const safe: Record<string, string> = {};
  for (const [k, v] of Object.entries(body)) {
    const keyLower = k.toLowerCase();
    if (keyLower === 'password' || keyLower === 'oob') {
      safe[k] = '[REDACTED]';
    } else {
      safe[k] = v;
    }
  }
  return safe;
}

function redactEmail(email: string): string {
  if (!email || email.length < 5) return '***';
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  const redactedLocal = local.length > 2 ? `${local.substring(0, 2)}***` : '***';
  return `${redactedLocal}@${domain}`;
}

/** Redact sensitive fields in Entra response for logging */
function redactResponseForLog(data: NativeAuthContinuationResponse | NativeAuthTokenResponse): Record<string, unknown> {
  const out: Record<string, unknown> = { ...data } as Record<string, unknown>;
  if ('continuation_token' in out && typeof out.continuation_token === 'string') {
    out.continuation_token = `<length=${(out.continuation_token as string).length}>`;
  }
  if ('continuation_token_new' in out && typeof (out as { continuation_token_new?: string }).continuation_token_new === 'string') {
    (out as { continuation_token_new?: string }).continuation_token_new = '[REDACTED]';
  }
  if ('access_token' in out && out.access_token) out.access_token = '[REDACTED]';
  if ('id_token' in out && out.id_token) out.id_token = '[REDACTED]';
  if ('refresh_token' in out && out.refresh_token) out.refresh_token = '[REDACTED]';
  return out;
}

async function nativeAuthPost(
  url: string,
  body: Record<string, string>,
  stepName: string
): Promise<{ status: number; data: NativeAuthContinuationResponse | NativeAuthTokenResponse }> {
  console.log(`[SIGNUP_ENTRA] ${stepName} REQUEST → ${url}`, { body: redactBodyForLog(body) });
  const encoded = new URLSearchParams(body).toString();
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: encoded,
  });
  const data = (await res.json().catch(() => ({}))) as NativeAuthContinuationResponse | NativeAuthTokenResponse;
  console.log(`[SIGNUP_ENTRA] ${stepName} RESPONSE ← status=${res.status}`, redactResponseForLog(data));
  return { status: res.status, data };
}

function userFromIdToken(idToken: string): IdpUserInfo & { personaCodeFromEntra: string } {
  const decoded = jwt.decode(idToken) as EntraIdTokenPayload | null;
  if (!decoded || typeof decoded !== 'object') {
    throw new Error('Invalid id_token');
  }
  const objectId = (decoded.oid ?? decoded.sub ?? '') as string;
  const email = (decoded.email ?? decoded.preferred_username ?? '') as string;
  const name = (decoded.name ?? decoded.given_name ?? email ?? 'Unknown') as string;
  console.log('[SIGNUP] userFromIdToken: id_token claims email=', decoded.email ?? '(missing)', 'preferred_username=', decoded.preferred_username ?? '(missing)', '-> resolved email=', email === '' ? '(empty)' : email.substring(0, 5) + '***', 'name=', name?.substring(0, 10) + (name?.length > 10 ? '...' : ''));
  const rawPersona = decoded.Persona ?? decoded.persona;
  const personaCodeFromEntra =
    rawPersona != null && String(rawPersona).trim() ? String(rawPersona).trim() : 'P1002';
  return {
    objectId,
    email,
    name,
    roles: [],
    groups: [],
    personaCodeFromEntra,
  };
}

/**
 * POST /auth/signup/start
 * Initiate sign-up flow: call Entra signup/start and signup/challenge to send OTP to email.
 */
export async function signupStart(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body as { email?: string };
    const email = body?.email;
    console.log('[SIGNUP_START] API called', { email: email ? redactEmail(email) : undefined });

    if (!email || typeof email !== 'string' || !email.trim()) {
      res.status(400).json({ error: 'email is required' });
      return;
    }

    const emailTrimmed = email.trim().toLowerCase();
    // Basic email validation
    if (!emailTrimmed.includes('@') || emailTrimmed.split('@').length !== 2) {
      res.status(400).json({ error: 'Invalid email format' });
      return;
    }

    if (!getCiamBaseUrl()) {
      res.status(503).json({
        error: 'native_auth_unavailable',
        error_description: 'Sign-up is not configured for this tenant (ENTRA_TENANT_NAME required)',
      });
      return;
    }

    const baseUrl = getCiamBaseUrl()!;
    const clientId = config.clientId;

    // Step 1: signup/v1.0/start
    const startUrl = `${baseUrl}/signup/v1.0/start`;
    const startBody: Record<string, string> = {
      client_id: clientId,
      challenge_type: CHALLENGE_TYPE_SIGNUP,
      username: emailTrimmed,
    };
    const startRes = await nativeAuthPost(startUrl, startBody, 'signup/start');
    const startData = startRes.data as NativeAuthContinuationResponse;

    if (startRes.status !== 200) {
      console.warn('[SIGNUP_START] signup/start FAILED', {
        status: startRes.status,
        error: startData.error,
        error_description: startData.error_description,
        full: startData,
      });
      if (startData.error === 'user_already_exists') {
        let person_exists = '';
        try {
          const claims = await getClaimsByEmail(emailTrimmed);
          if (claims?.personId) {
            person_exists = `Person exists as : ${claims.personId}`;
          }
        } catch (err) {
          console.warn('[SIGNUP_START] person_exists check failed (user_already_exists):', err instanceof Error ? err.message : err);
        }
        res.status(400).json({
          error: 'user_already_exists',
          error_description: 'An account with this email already exists',
          person_exists,
        });
        return;
      }
      res.status(400).json({
        error: 'signup_failed',
        error_description: 'Failed to initiate sign-up. Please try again.',
      });
      return;
    }
    if (startData.challenge_type === 'redirect') {
      res.status(400).json({
        error: 'redirect_required',
        error_description: 'Web-based sign-up is required for this account',
      });
      return;
    }
    let continuationToken = startData.continuation_token;
    if (!continuationToken) {
      res.status(500).json({
        error: 'signup_failed',
        error_description: 'Failed to initiate sign-up. Please try again.',
      });
      return;
    }

    // Step 2: signup/v1.0/challenge (triggers OTP email)
    const challengeUrl = `${baseUrl}/signup/v1.0/challenge`;
    const challengeBody: Record<string, string> = {
      client_id: clientId,
      challenge_type: CHALLENGE_TYPE_SIGNUP,
      continuation_token: continuationToken,
    };
    const challengeRes = await nativeAuthPost(challengeUrl, challengeBody, 'signup/challenge');
    const challengeData = challengeRes.data as NativeAuthContinuationResponse;

    if (challengeRes.status !== 200) {
      console.warn('[SIGNUP_START] signup/challenge FAILED', {
        status: challengeRes.status,
        error: challengeData.error,
        error_description: challengeData.error_description,
        full: challengeData,
      });
      res.status(400).json({
        error: 'signup_failed',
        error_description: 'Failed to send verification code. Please try again.',
      });
      return;
    }
    if (challengeData.challenge_type === 'redirect') {
      res.status(400).json({
        error: 'redirect_required',
        error_description: 'Web-based sign-up is required for this account',
      });
      return;
    }
    continuationToken =
      challengeData.continuation_token ?? (challengeData as { continuation_token_new?: string }).continuation_token_new ?? continuationToken;
    if (!continuationToken) {
      res.status(500).json({
        error: 'signup_failed',
        error_description: 'Failed to send verification code. Please try again.',
      });
      return;
    }

    // Store continuation token for signup/complete API (keyed by email)
    storeSignupContinuationToken(emailTrimmed, continuationToken);
    console.log('[SIGNUP_START] Success: OTP sent, continuation token stored');

    // Ensure prospect exists and create registration journey entries (step 10 for new prospect, step 20 always)
    let prospectId: number | null = null;
    let isNewProspect = false;
    try {
      let prospect = await getProspectByEmail(emailTrimmed);
      console.log('[SIGNUP_START] getProspectByEmail result:', prospect ? { prospect_id: prospect.prospect_id ?? prospect.id } : 'null');
      if (!prospect) {
        prospect = await createProspect(emailTrimmed, 'self-serve', 'system', { mode: 'insert' });
        isNewProspect = !!prospect;
        console.log('[SIGNUP_START] createProspect (new) result:', prospect ? { prospect_id: prospect.prospect_id ?? prospect.id } : 'null');
      }
      prospectId = prospect ? Number(prospect.id ?? prospect.prospect_id) : null;
      console.log('[SIGNUP_START] prospectId resolved:', prospectId, 'isNewProspect:', isNewProspect);
      if (prospectId != null && Number.isFinite(prospectId)) {
        if (isNewProspect) {
          const journey10 = await createRegistrationJourneyByStepId(prospectId, 10, 'COMPLETED', null);
          console.log('[SIGNUP_START] createRegistrationJourneyByStepId(prospectId, 10, COMPLETED) returned:', journey10 ? { journey_id: journey10.journey_id } : 'null');
        }
        const journey20 = await createRegistrationJourneyByStepId(prospectId, 20, 'COMPLETED', null);
        console.log('[SIGNUP_START] createRegistrationJourneyByStepId(prospectId, 20, COMPLETED) returned:', journey20 ? { journey_id: journey20.journey_id } : 'null');
      } else {
        console.warn('[SIGNUP_START] Prospect/journey skipped: no prospect id (DB may be unconfigured or create failed)');
      }
    } catch (err) {
      console.warn('[SIGNUP_START] Prospect or registration journey creation failed (continuing):', err instanceof Error ? err.message : err);
    }

    let journey_status = '';
    try {
      console.log('[SIGNUP_START] Resolving journey_status for prospectId:', prospectId);
      if (prospectId != null && Number.isFinite(prospectId)) {
        const latestJourney = await getLatestRegistrationJourneyByProspectId(prospectId);
        console.log('[SIGNUP_START] getLatestRegistrationJourneyByProspectId returned:', latestJourney ? { journey_id: latestJourney.journey_id, current_step_id: latestJourney.current_step_id, status: latestJourney.status } : 'null');
        if (latestJourney) {
          const stepName = await getStepNameByStepId(latestJourney.current_step_id);
          console.log('[SIGNUP_START] getStepNameByStepId(current_step_id=', latestJourney.current_step_id, ') returned:', stepName ?? 'null');
          journey_status = stepName ?? latestJourney.status ?? `STEP_${latestJourney.current_step_id}`;
        } else {
          // No journey row yet (e.g. creation failed or no rows) — we just sent OTP
          journey_status = 'OTP_SENT';
        }
      } else {
        journey_status = 'OTP_SENT';
      }
      console.log('[SIGNUP_START] final journey_status:', journey_status);
    } catch (err) {
      console.warn('[SIGNUP_START] journey_status lookup failed (continuing):', err instanceof Error ? err.message : err);
      journey_status = 'OTP_SENT';
    }

    // Check if person already exists for this email (subject.person by primary_email)
    let person_exists = '';
    try {
      const claims = await getClaimsByEmail(emailTrimmed);
      if (claims?.personId) {
        person_exists = `Person exists as : ${claims.personId}`;
      }
    } catch (err) {
      console.warn('[SIGNUP_START] person_exists check failed (continuing):', err instanceof Error ? err.message : err);
    }

    res.status(200).json({
      message: 'Verification code sent to your email',
      email: redactEmail(emailTrimmed),
      journey_status,
      ...(isNewProspect && prospectId != null && Number.isFinite(prospectId) ? { prospect_id: prospectId } : {}),
      person_exists,
    });
  } catch (error) {
    console.error('[SIGNUP_START] Error:', error instanceof Error ? error.message : error);
    res.status(500).json({
      error: 'server_error',
      error_description: 'Sign-up initiation failed',
    });
  }
}

/**
 * POST /auth/signup/verify-otp
 * Verify OTP only. Stores post-OTP continuation token for /auth/signup/submit-password.
 */
export async function signupVerifyOtp(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body as { email?: string; code?: string };
    const email = body?.email;
    const code = body?.code;
    console.log('[SIGNUP_VERIFY_OTP] API called', { email: email ? redactEmail(email) : undefined, code: code ? '[REDACTED]' : undefined });

    if (!email || typeof email !== 'string' || !email.trim()) {
      res.status(400).json({ error: 'email is required' });
      return;
    }
    if (!code || typeof code !== 'string' || !code.trim()) {
      res.status(400).json({ error: 'code is required' });
      return;
    }

    const emailTrimmed = email.trim().toLowerCase();
    const codeTrimmed = code.trim();

    if (!getCiamBaseUrl()) {
      res.status(503).json({
        error: 'native_auth_unavailable',
        error_description: 'Sign-up is not configured for this tenant (ENTRA_TENANT_NAME required)',
      });
      return;
    }

    const continuationToken = getSignupContinuationToken(emailTrimmed);
    console.log('[SIGNUP_VERIFY_OTP] Continuation token from store:', continuationToken ? '<present>' : 'missing/expired');
    if (!continuationToken) {
      try {
        const prospect = await getProspectByEmail(emailTrimmed);
        if (prospect) {
          const prospectId = Number(prospect.prospect_id ?? prospect.id);
          if (Number.isFinite(prospectId)) {
            await createRegistrationJourneyByStepId(prospectId, 30, 'FAILED', null);
          }
        }
      } catch (_) {
        // ignore DB errors; don't change response
      }
      res.status(401).json({
        error: 'expired_token',
        error_description: 'Verification code expired. Please start sign-up again.',
        journey_status: 'OTP_VERIFICATION_FAILED',
      });
      return;
    }

    const baseUrl = getCiamBaseUrl()!;
    const clientId = config.clientId;
    const continueOobUrl = `${baseUrl}/signup/v1.0/continue`;
    const continueOobBody: Record<string, string> = {
      continuation_token: continuationToken,
      client_id: clientId,
      grant_type: 'oob',
      oob: codeTrimmed,
    };
    const continueOobRes = await nativeAuthPost(continueOobUrl, continueOobBody, 'signup/continue (oob)');
    const continueOobData = continueOobRes.data as NativeAuthContinuationResponse;

    // credential_required (400) is expected when password wasn't submitted in /start — Entra still returns continuation_token
    let newContinuationToken: string | undefined;
    if (continueOobRes.status === 400 && continueOobData.error === 'credential_required' && continueOobData.continuation_token) {
      console.log('[SIGNUP_VERIFY_OTP] OTP verified, password required (credential_required response)');
      newContinuationToken = continueOobData.continuation_token;
    } else if (continueOobRes.status === 200) {
      newContinuationToken =
        continueOobData.continuation_token ?? (continueOobData as { continuation_token_new?: string }).continuation_token_new;
    } else {
      console.warn('[SIGNUP_VERIFY_OTP] signup/continue (oob) FAILED', {
        status: continueOobRes.status,
        error: continueOobData.error,
        error_description: continueOobData.error_description,
        full: continueOobData,
      });
      try {
        const prospect = await getProspectByEmail(emailTrimmed);
        if (prospect) {
          const prospectId = Number(prospect.prospect_id ?? prospect.id);
          if (Number.isFinite(prospectId)) {
            await createRegistrationJourneyByStepId(prospectId, 30, 'FAILED', null);
          }
        }
      } catch (_) {
        // ignore DB errors
      }
      res.status(401).json({
        error: 'invalid_grant',
        error_description: 'Invalid verification code',
        journey_status: 'OTP_VERIFICATION_FAILED',
      });
      return;
    }

    if (!newContinuationToken) {
      try {
        const prospect = await getProspectByEmail(emailTrimmed);
        if (prospect) {
          const prospectId = Number(prospect.prospect_id ?? prospect.id);
          if (Number.isFinite(prospectId)) {
            await createRegistrationJourneyByStepId(prospectId, 30, 'FAILED', null);
          }
        }
      } catch (_) {
        // ignore DB errors
      }
      res.status(401).json({
        error: 'invalid_grant',
        error_description: 'Invalid verification code',
        journey_status: 'OTP_VERIFICATION_FAILED',
      });
      return;
    }

    storePostOtpContinuationToken(emailTrimmed, newContinuationToken);
    console.log('[SIGNUP_VERIFY_OTP] Success: OTP verified, post-OTP token stored');

    let journey_status = 'OTP_VERIFIED';
    try {
      const prospect = await getProspectByEmail(emailTrimmed);
      if (prospect) {
        const prospectId = Number(prospect.prospect_id ?? prospect.id);
        if (Number.isFinite(prospectId)) {
          await createRegistrationJourneyByStepId(prospectId, 30, 'COMPLETED', null);
          const latestJourney = await getLatestRegistrationJourneyByProspectId(prospectId);
          if (latestJourney) {
            const stepName = await getStepNameByStepId(30);
            journey_status = stepName ?? latestJourney.status ?? journey_status;
          }
        }
      }
    } catch (err) {
      console.warn('[SIGNUP_VERIFY_OTP] Prospect/journey_status failed (continuing):', err instanceof Error ? err.message : err);
    }

    res.status(200).json({
      ok: true,
      message: 'OTP verified. Proceed to submit password.',
      journey_status,
    });
  } catch (error) {
    console.error('[SIGNUP_VERIFY_OTP] Error:', error instanceof Error ? error.message : error);
    res.status(500).json({
      error: 'server_error',
      error_description: 'OTP verification failed',
    });
  }
}

/**
 * POST /auth/signup/submit-password
 * Submit password and complete sign-up. Requires prior OTP verification via /auth/signup/verify-otp.
 */
export async function signupSubmitPassword(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body as { email?: string; password?: string; displayName?: string; role?: string };
    const email = body?.email;
    const password = body?.password;
    const displayName = body?.displayName;
    const role = body?.role;
    console.log('[SIGNUP_SUBMIT_PASSWORD] API called', {
      email: email ? redactEmail(email) : undefined,
      displayName: displayName ?? undefined,
      role: role ?? undefined,
      password: password ? '[REDACTED]' : undefined,
    });

    if (!email || typeof email !== 'string' || !email.trim()) {
      res.status(400).json({ error: 'email is required' });
      return;
    }
    if (!password || typeof password !== 'string') {
      res.status(400).json({ error: 'password is required' });
      return;
    }
    if (!role || typeof role !== 'string' || !role.trim()) {
      res.status(400).json({ error: 'role is required' });
      return;
    }

    const emailTrimmed = email.trim().toLowerCase();
    // Use displayName if provided; otherwise use the part of the email before @
    const displayNameToUse =
      typeof displayName === 'string' && displayName.trim()
        ? displayName.trim()
        : (emailTrimmed.includes('@') ? emailTrimmed.split('@')[0] : emailTrimmed) || 'User';

    if (!getCiamBaseUrl()) {
      res.status(503).json({
        error: 'native_auth_unavailable',
        error_description: 'Sign-up is not configured for this tenant (ENTRA_TENANT_NAME required)',
      });
      return;
    }

    let continuationToken = getPostOtpContinuationToken(emailTrimmed);
    console.log('[SIGNUP_SUBMIT_PASSWORD] Post-OTP continuation token:', continuationToken ? '<present>' : 'missing/expired');
    if (!continuationToken) {
      res.status(401).json({
        error: 'expired_token',
        error_description: 'OTP verification expired. Please start sign-up again.',
      });
      return;
    }

    const baseUrl = getCiamBaseUrl()!;
    const clientId = config.clientId;
    const continueOobUrl = `${baseUrl}/signup/v1.0/continue`;

    // Step 1: signup/v1.0/continue (submit password)
    const continuePasswordBody: Record<string, string> = {
      continuation_token: continuationToken,
      client_id: clientId,
      grant_type: 'password',
      password,
    };
    const continuePasswordRes = await nativeAuthPost(continueOobUrl, continuePasswordBody, 'signup/continue (password)');
    const continuePasswordData = continuePasswordRes.data as NativeAuthContinuationResponse;

    if (continuePasswordRes.status === 400 && continuePasswordData.error === 'attributes_required' && continuePasswordData.continuation_token) {
      console.log('[SIGNUP_SUBMIT_PASSWORD] Password accepted, attributes required (attributes_required response)');
      continuationToken = continuePasswordData.continuation_token;
    } else if (continuePasswordRes.status !== 200) {
      console.warn('[SIGNUP_SUBMIT_PASSWORD] signup/continue (password) FAILED', {
        status: continuePasswordRes.status,
        error: continuePasswordData.error,
        error_description: continuePasswordData.error_description,
        full: continuePasswordData,
      });
      const errorCode = continuePasswordData.error;
      const suberror = (continuePasswordData as { suberror?: string }).suberror;
      if (errorCode === 'invalid_grant' && (suberror === 'password_too_weak' || suberror === 'password_too_short')) {
        try {
          const prospect = await getProspectByEmail(emailTrimmed);
          if (prospect) {
            const prospectId = Number(prospect.prospect_id ?? prospect.id);
            if (Number.isFinite(prospectId)) await createRegistrationJourneyByStepId(prospectId, 40, 'FAILED', null);
          }
        } catch (_) {}
        res.status(400).json({
          error: 'invalid_password',
          error_description: 'Password does not meet requirements',
          journey_status: 'PASSWORD_VERIFICATION_FAILED',
        });
        return;
      }
      try {
        const prospect = await getProspectByEmail(emailTrimmed);
        if (prospect) {
          const prospectId = Number(prospect.prospect_id ?? prospect.id);
          if (Number.isFinite(prospectId)) await createRegistrationJourneyByStepId(prospectId, 40, 'FAILED', null);
        }
      } catch (_) {}
      res.status(401).json({
        error: 'invalid_grant',
        error_description: 'Invalid password',
        journey_status: 'PASSWORD_VERIFICATION_FAILED',
      });
      return;
    } else {
      continuationToken =
        continuePasswordData.continuation_token ?? (continuePasswordData as { continuation_token_new?: string }).continuation_token_new ?? continuationToken;
    }

    if (!continuationToken) {
      try {
        const prospect = await getProspectByEmail(emailTrimmed);
        if (prospect) {
          const prospectId = Number(prospect.prospect_id ?? prospect.id);
          if (Number.isFinite(prospectId)) await createRegistrationJourneyByStepId(prospectId, 40, 'FAILED', null);
        }
      } catch (_) {}
      res.status(401).json({
        error: 'invalid_grant',
        error_description: 'Invalid password',
        journey_status: 'PASSWORD_VERIFICATION_FAILED',
      });
      return;
    }

    // Password verified: record journey step 40 COMPLETED
    try {
      const prospect = await getProspectByEmail(emailTrimmed);
      if (prospect) {
        const prospectId = Number(prospect.prospect_id ?? prospect.id);
        if (Number.isFinite(prospectId)) await createRegistrationJourneyByStepId(prospectId, 40, 'COMPLETED', null);
      }
    } catch (_) {}

    // Step 2: signup/v1.0/continue (submit mandatory attributes: displayName, Role)
    const roleAttr = getRoleExtensionAttribute();
    const attributesPayload = {
      displayName: displayNameToUse,
      [roleAttr]: role!.trim(),
    };
    const continueAttributesBody: Record<string, string> = {
      continuation_token: continuationToken,
      client_id: clientId,
      grant_type: 'attributes',
      attributes: JSON.stringify(attributesPayload),
    };
    const continueAttributesRes = await nativeAuthPost(continueOobUrl, continueAttributesBody, 'signup/continue (attributes)');
    const continueAttributesData = continueAttributesRes.data as NativeAuthContinuationResponse;

    if (continueAttributesRes.status !== 200) {
      console.warn('[SIGNUP_SUBMIT_PASSWORD] signup/continue (attributes) FAILED', {
        status: continueAttributesRes.status,
        error: continueAttributesData.error,
        error_description: continueAttributesData.error_description,
        full: continueAttributesData,
      });
      res.status(400).json({
        error: 'invalid_attributes',
        error_description: continueAttributesData.error_description || 'Invalid or missing required attributes',
      });
      return;
    }
    continuationToken =
      continueAttributesData.continuation_token ?? (continueAttributesData as { continuation_token_new?: string }).continuation_token_new ?? continuationToken;
    if (!continuationToken) {
      res.status(500).json({
        error: 'signup_failed',
        error_description: 'Failed to complete sign-up. Please try again.',
      });
      return;
    }

    // Step 3: oauth2/v2.0/token (get Entra tokens)
    const tokenUrl = `${baseUrl}/oauth2/v2.0/token`;
    const tokenBody: Record<string, string> = {
      continuation_token: continuationToken,
      client_id: clientId,
      grant_type: 'continuation_token',
      scope: 'openid offline_access',
      username: emailTrimmed,
    };
    const tokenRes = await nativeAuthPost(tokenUrl, tokenBody, 'oauth2/token');
    const tokenData = tokenRes.data as NativeAuthTokenResponse;

    if (tokenRes.status !== 200 || tokenData.error) {
      console.warn('[SIGNUP_SUBMIT_PASSWORD] token FAILED', {
        status: tokenRes.status,
        error: tokenData.error,
        error_description: tokenData.error_description,
        full: { ...tokenData, access_token: tokenData.access_token ? '[REDACTED]' : undefined, id_token: tokenData.id_token ? '[REDACTED]' : undefined },
      });
      res.status(401).json({
        error: 'token_failed',
        error_description: 'Failed to complete sign-up. Please try again.',
      });
      return;
    }

    const idToken = tokenData.id_token;
    if (!idToken) {
      console.warn('[SIGNUP_SUBMIT_PASSWORD] No id_token in Entra response');
      res.status(500).json({
        error: 'token_failed',
        error_description: 'Failed to complete sign-up. Please try again.',
      });
      return;
    }

    // Extract user identity from id_token
    let userInfo: IdpUserInfo;
    let personaCodeFromEntra = 'P1002';
    try {
      const parsed = userFromIdToken(idToken);
      userInfo = {
        objectId: parsed.objectId,
        email: parsed.email,
        name: parsed.name,
        roles: parsed.roles,
        groups: parsed.groups,
      };
      personaCodeFromEntra = parsed.personaCodeFromEntra;
    } catch (decodeErr) {
      console.warn('[SIGNUP_SUBMIT_PASSWORD] id_token decode failed:', decodeErr instanceof Error ? decodeErr.message : String(decodeErr));
      res.status(500).json({
        error: 'token_failed',
        error_description: 'Failed to complete sign-up. Please try again.',
      });
      return;
    }

    if (!userInfo.email || !userInfo.email.trim()) {
      userInfo = { ...userInfo, email: emailTrimmed };
      console.log('[SIGNUP_SUBMIT_PASSWORD] id_token had no email; using request body email');
    }
    const nameFromToken = userInfo.name?.trim();
    if (!nameFromToken || nameFromToken === 'Unknown') {
      userInfo = { ...userInfo, name: displayNameToUse };
      console.log('[SIGNUP_SUBMIT_PASSWORD] id_token had no/unknown name; using displayName from request or email');
    }

    const idpUser: IdpUserInfo = {
      objectId: userInfo.objectId,
      email: userInfo.email,
      name: userInfo.name,
      roles: userInfo.roles,
      groups: userInfo.groups,
    };

    const emailForClaims = userInfo.email;
    let apiClaims: Awaited<ReturnType<typeof getClaimsByEmail>> = null;
    let personCreationFailed = false;
    try {
      apiClaims = await getClaimsByEmail(emailForClaims);
      if (!apiClaims) {
        await syncPersonFromEntra(userInfo.objectId, userInfo.email, userInfo.name, personaCodeFromEntra);
        apiClaims = await getClaimsByEmail(emailForClaims);
      }
    } catch (e) {
      console.warn('[SIGNUP_SUBMIT_PASSWORD] getClaimsByEmail/sync failed:', e instanceof Error ? e.message : e);
      personCreationFailed = true;
    }

    if (personCreationFailed || !apiClaims) {
      try {
        const prospect = await getProspectByEmail(emailTrimmed);
        if (prospect) {
          const prospectId = Number(prospect.prospect_id ?? prospect.id);
          if (Number.isFinite(prospectId)) await createRegistrationJourneyByStepId(prospectId, 50, 'FAILED', null);
        }
      } catch (_) {}
      res.status(500).json({
        error: 'person_creation_failed',
        error_description: 'Failed to create or load person record.',
        journey_status: 'PERSON_ID_GENERATION_FAILED',
      });
      return;
    }

    try {
      await createProspect(emailTrimmed, undefined, undefined, { person_uuid: apiClaims.personId, mode: 'update' });
      const prospect = await getProspectByEmail(emailTrimmed);
      if (prospect) {
        const prospectId = Number(prospect.prospect_id ?? prospect.id);
        if (Number.isFinite(prospectId)) {
          await createRegistrationJourneyByStepId(prospectId, 50, 'COMPLETED', null);
          await createRegistrationJourneyByStepId(prospectId, 60, 'COMPLETED', null);
        }
      }
    } catch (_) {}

    const jwtPayload = buildUserClaims(idpUser, apiClaims);
    const accessToken = jwtService.sign(jwtPayload);
    const expiresInSeconds = config.jwtExpirationMinutes * 60;
    const refreshToken = createRefreshToken(jwtPayload);
    const refresh_expiry_time = config.refreshTokenExpirationDays * 24 * 60 * 60;
    console.log('[SIGNUP_SUBMIT_PASSWORD] Success: platform JWT and refresh token issued');

    let journey_status = 'SIGNUP_COMPLETED';
    try {
      const prospect = await getProspectByEmail(emailTrimmed);
      if (prospect) {
        const prospectId = Number(prospect.prospect_id ?? prospect.id);
        if (Number.isFinite(prospectId)) {
          const latestJourney = await getLatestRegistrationJourneyByProspectId(prospectId);
          if (latestJourney) {
            const stepName = await getStepNameByStepId(60);
            journey_status = stepName ?? latestJourney.status ?? journey_status;
          }
        }
      }
    } catch (_) {}

    res.status(200).json({
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: expiresInSeconds,
      refresh_token: refreshToken,
      journey_status,
      person_id: apiClaims.personId,
      refresh_expiry_time,
    });
  } catch (error) {
    console.error('[SIGNUP_SUBMIT_PASSWORD] Error:', error instanceof Error ? error.message : error);
    res.status(500).json({
      error: 'server_error',
      error_description: 'Sign-up completion failed',
    });
  }
}

/**
 * POST /auth/signup/complete
 * Complete sign-up: verify OTP, submit password, get Entra tokens, issue platform JWT.
 */
export async function signupComplete(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body as { email?: string; code?: string; password?: string; displayName?: string; role?: string };
    const email = body?.email;
    const code = body?.code;
    const password = body?.password;
    const displayName = body?.displayName;
    const role = body?.role;
    console.log('[SIGNUP_COMPLETE] API called', {
      email: email ? redactEmail(email) : undefined,
      displayName: displayName ?? undefined,
      role: role ?? undefined,
      code: code ? '[REDACTED]' : undefined,
      password: password ? '[REDACTED]' : undefined,
    });

    if (!email || typeof email !== 'string' || !email.trim()) {
      res.status(400).json({ error: 'email is required' });
      return;
    }
    if (!code || typeof code !== 'string' || !code.trim()) {
      res.status(400).json({ error: 'code is required' });
      return;
    }
    if (!password || typeof password !== 'string') {
      res.status(400).json({ error: 'password is required' });
      return;
    }
    if (!displayName || typeof displayName !== 'string' || !displayName.trim()) {
      res.status(400).json({ error: 'displayName is required' });
      return;
    }
    if (!role || typeof role !== 'string' || !role.trim()) {
      res.status(400).json({ error: 'role is required' });
      return;
    }

    const emailTrimmed = email.trim().toLowerCase();
    const codeTrimmed = code.trim();

    if (!getCiamBaseUrl()) {
      res.status(503).json({
        error: 'native_auth_unavailable',
        error_description: 'Sign-up is not configured for this tenant (ENTRA_TENANT_NAME required)',
      });
      return;
    }

    // Retrieve continuation token from store (consumes/removes on read)
    let continuationToken = getSignupContinuationToken(emailTrimmed);
    console.log('[SIGNUP_COMPLETE] Continuation token from store:', continuationToken ? '<present>' : 'missing/expired');
    if (!continuationToken) {
      res.status(401).json({
        error: 'expired_token',
        error_description: 'Verification code expired. Please start sign-up again.',
      });
      return;
    }

    const baseUrl = getCiamBaseUrl()!;
    const clientId = config.clientId;

    // Step 1: signup/v1.0/continue (submit OTP)
    const continueOobUrl = `${baseUrl}/signup/v1.0/continue`;
    const continueOobBody: Record<string, string> = {
      continuation_token: continuationToken,
      client_id: clientId,
      grant_type: 'oob',
      oob: codeTrimmed,
    };
    const continueOobRes = await nativeAuthPost(continueOobUrl, continueOobBody, 'signup/continue (oob)');
    const continueOobData = continueOobRes.data as NativeAuthContinuationResponse;

    // credential_required (400) is expected when password wasn't submitted in /start — Entra still returns continuation_token
    if (continueOobRes.status === 400 && continueOobData.error === 'credential_required' && continueOobData.continuation_token) {
      console.log('[SIGNUP_COMPLETE] OTP verified, password required (credential_required response)');
      continuationToken = continueOobData.continuation_token;
    } else if (continueOobRes.status !== 200) {
      console.warn('[SIGNUP_COMPLETE] signup/continue (oob) FAILED', {
        status: continueOobRes.status,
        error: continueOobData.error,
        error_description: continueOobData.error_description,
        full: continueOobData,
      });
      res.status(401).json({
        error: 'invalid_grant',
        error_description: 'Invalid verification code',
      });
      return;
    } else {
      continuationToken =
        continueOobData.continuation_token ?? (continueOobData as { continuation_token_new?: string }).continuation_token_new ?? continuationToken;
    }

    if (!continuationToken) {
      res.status(401).json({
        error: 'invalid_grant',
        error_description: 'Invalid verification code',
      });
      return;
    }

    // Step 2: signup/v1.0/continue (submit password)
    const continuePasswordBody: Record<string, string> = {
      continuation_token: continuationToken,
      client_id: clientId,
      grant_type: 'password',
      password,
    };
    const continuePasswordRes = await nativeAuthPost(continueOobUrl, continuePasswordBody, 'signup/continue (password)');
    const continuePasswordData = continuePasswordRes.data as NativeAuthContinuationResponse;

    // attributes_required (400) is expected when Entra requires displayName/Role — it returns continuation_token to continue
    if (continuePasswordRes.status === 400 && continuePasswordData.error === 'attributes_required' && continuePasswordData.continuation_token) {
      console.log('[SIGNUP_COMPLETE] Password accepted, attributes required (attributes_required response)');
      continuationToken = continuePasswordData.continuation_token;
    } else if (continuePasswordRes.status !== 200) {
      console.warn('[SIGNUP_COMPLETE] signup/continue (password) FAILED', {
        status: continuePasswordRes.status,
        error: continuePasswordData.error,
        error_description: continuePasswordData.error_description,
        full: continuePasswordData,
      });
      const errorCode = continuePasswordData.error;
      const suberror = (continuePasswordData as { suberror?: string }).suberror;
      if (errorCode === 'invalid_grant' && (suberror === 'password_too_weak' || suberror === 'password_too_short')) {
        res.status(400).json({
          error: 'invalid_password',
          error_description: 'Password does not meet requirements',
        });
        return;
      }
      res.status(401).json({
        error: 'invalid_grant',
        error_description: 'Invalid password',
      });
      return;
    } else {
      continuationToken =
        continuePasswordData.continuation_token ?? (continuePasswordData as { continuation_token_new?: string }).continuation_token_new ?? continuationToken;
    }

    if (!continuationToken) {
      res.status(401).json({
        error: 'invalid_grant',
        error_description: 'Invalid password',
      });
      return;
    }

    // Step 2.5: signup/v1.0/continue (submit mandatory attributes: displayName, Role)
    const roleAttr = getRoleExtensionAttribute();
    const attributesPayload = {
      displayName: displayName!.trim(),
      [roleAttr]: role!.trim(),
    };
    const continueAttributesBody: Record<string, string> = {
      continuation_token: continuationToken,
      client_id: clientId,
      grant_type: 'attributes',
      attributes: JSON.stringify(attributesPayload),
    };
    const continueAttributesRes = await nativeAuthPost(continueOobUrl, continueAttributesBody, 'signup/continue (attributes)');
    const continueAttributesData = continueAttributesRes.data as NativeAuthContinuationResponse;

    if (continueAttributesRes.status !== 200) {
      console.warn('[SIGNUP_COMPLETE] signup/continue (attributes) FAILED', {
        status: continueAttributesRes.status,
        error: continueAttributesData.error,
        error_description: continueAttributesData.error_description,
        full: continueAttributesData,
      });
      res.status(400).json({
        error: 'invalid_attributes',
        error_description: continueAttributesData.error_description || 'Invalid or missing required attributes',
      });
      return;
    }
    continuationToken =
      continueAttributesData.continuation_token ?? (continueAttributesData as { continuation_token_new?: string }).continuation_token_new ?? continuationToken;
    if (!continuationToken) {
      res.status(500).json({
        error: 'signup_failed',
        error_description: 'Failed to complete sign-up. Please try again.',
      });
      return;
    }

    // Step 3: oauth2/v2.0/token (get Entra tokens)
    const tokenUrl = `${baseUrl}/oauth2/v2.0/token`;
    const tokenBody: Record<string, string> = {
      continuation_token: continuationToken,
      client_id: clientId,
      grant_type: 'continuation_token',
      scope: 'openid offline_access',
      username: emailTrimmed,
    };
    const tokenRes = await nativeAuthPost(tokenUrl, tokenBody, 'oauth2/token');
    const tokenData = tokenRes.data as NativeAuthTokenResponse;

    if (tokenRes.status !== 200 || tokenData.error) {
      console.warn('[SIGNUP_COMPLETE] token FAILED', {
        status: tokenRes.status,
        error: tokenData.error,
        error_description: tokenData.error_description,
        full: { ...tokenData, access_token: tokenData.access_token ? '[REDACTED]' : undefined, id_token: tokenData.id_token ? '[REDACTED]' : undefined },
      });
      res.status(401).json({
        error: 'token_failed',
        error_description: 'Failed to complete sign-up. Please try again.',
      });
      return;
    }

    const idToken = tokenData.id_token;
    if (!idToken) {
      console.warn('[SIGNUP_COMPLETE] No id_token in Entra response');
      res.status(500).json({
        error: 'token_failed',
        error_description: 'Failed to complete sign-up. Please try again.',
      });
      return;
    }

    // Extract user identity from id_token
    let userInfo: IdpUserInfo;
    let personaCodeFromEntra = 'P1002';
    try {
      const parsed = userFromIdToken(idToken);
      userInfo = {
        objectId: parsed.objectId,
        email: parsed.email,
        name: parsed.name,
        roles: parsed.roles,
        groups: parsed.groups,
      };
      personaCodeFromEntra = parsed.personaCodeFromEntra;
    } catch (decodeErr) {
      console.warn('[SIGNUP_COMPLETE] id_token decode failed:', decodeErr instanceof Error ? decodeErr.message : String(decodeErr));
      res.status(500).json({
        error: 'token_failed',
        error_description: 'Failed to complete sign-up. Please try again.',
      });
      return;
    }

    // Fallback to request body when id_token doesn't include email/name (common with Entra native auth)
    if (!userInfo.email || !userInfo.email.trim()) {
      userInfo = { ...userInfo, email: emailTrimmed };
      console.log('[SIGNUP_COMPLETE] id_token had no email; using request body email');
    }
    const nameFromToken = userInfo.name?.trim();
    if (!nameFromToken || nameFromToken === 'Unknown') {
      userInfo = { ...userInfo, name: displayName!.trim() };
      console.log('[SIGNUP_COMPLETE] id_token had no/unknown name; using request body displayName');
    }

    const idpUser: IdpUserInfo = {
      objectId: userInfo.objectId,
      email: userInfo.email,
      name: userInfo.name,
      roles: userInfo.roles,
      groups: userInfo.groups,
    };

    // Email used for getClaimsByEmail and sync (id_token with body fallback for signup)
    const emailForClaims = userInfo.email;
    console.log('[SIGNUP_COMPLETE] Identity from id_token: email=', emailForClaims, 'objectId=', userInfo.objectId, 'name=', userInfo.name ?? '(empty)', 'personaCode=', personaCodeFromEntra);

    // Sync user to DB and get claims (same as redirect callback: insert into subject.person + subject.persona_assignment when new)
    let apiClaims: Awaited<ReturnType<typeof getClaimsByEmail>> = null;
    try {
      console.log('[SIGNUP_COMPLETE] Fetching DB claims for email:', emailForClaims);
      apiClaims = await getClaimsByEmail(emailForClaims);
      if (apiClaims) {
        console.log('[SIGNUP_COMPLETE] DB claims found for', emailForClaims, '| aud:', apiClaims.aud?.length ?? 0, 'apps, personId:', apiClaims.personId ?? '—', 'personUuid:', apiClaims.personUuid ?? '—');
      } else {
        console.log('[SIGNUP_COMPLETE] No DB claims (null) for', emailForClaims, ', syncing person from Entra then re-fetching');
        console.log('[SIGNUP_COMPLETE] Passing to syncPersonFromEntra: email=', userInfo.email === '' ? '(empty string)' : userInfo.email.substring(0, 5) + '***', 'name=', userInfo.name ?? '(null)', 'objectId=', userInfo.objectId);
        await syncPersonFromEntra(userInfo.objectId, userInfo.email, userInfo.name, personaCodeFromEntra);
        apiClaims = await getClaimsByEmail(emailForClaims);
        if (apiClaims) {
          console.log('[SIGNUP_COMPLETE] DB claims loaded after sync for', emailForClaims, '| aud:', apiClaims.aud?.length ?? 0, 'apps, personId:', apiClaims.personId ?? '—');
        } else {
          console.log('[SIGNUP_COMPLETE] No DB claims after sync for', emailForClaims, ', will use default/mock claims');
        }
      }
    } catch (e) {
      console.warn('[SIGNUP_COMPLETE] getClaimsByEmail/sync failed for email=', emailForClaims, ', using defaults:', e instanceof Error ? e.message : e);
    }

    // Issue platform JWT
    const jwtPayload = buildUserClaims(idpUser, apiClaims);
    console.log('[SIGNUP_COMPLETE] Building JWT: sub=', jwtPayload.sub, 'aud=', (jwtPayload as { aud?: string[] }).aud ?? 'config default', 'personId=', (jwtPayload as { personId?: string }).personId ?? '—');
    const accessToken = jwtService.sign(jwtPayload);
    const expiresInSeconds = config.jwtExpirationMinutes * 60;
    const refreshToken = createRefreshToken(jwtPayload);
    console.log('[SIGNUP_COMPLETE] Success: platform JWT and refresh token issued');

    res.status(200).json({
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: expiresInSeconds,
      refresh_token: refreshToken,
      journey_status: '',
    });
  } catch (error) {
    console.error('[SIGNUP_COMPLETE] Error:', error instanceof Error ? error.message : error);
    res.status(500).json({
      error: 'server_error',
      error_description: 'Sign-up completion failed',
    });
  }
}
