/**
 * Password reset flow using Entra External ID native SSPR API.
 * POST /auth/password-reset/start - Send OTP to email
 * POST /auth/password-reset/verify-otp - Verify OTP, store token for submit-password
 * POST /auth/password-reset/submit-password - Submit new password, then sign in and return tokens
 */

import { Request, Response } from 'express';
import { config } from '../config';
import { JWTService } from '../jwt/jwt.service';
import { buildUserClaims } from './claims.helper';
import { getClaimsByEmail } from '../db/get-claims-by-email';
import { syncPersonFromEntra } from '../db/sync-person-from-entra';
import { getProspectByEmail, getLatestRegistrationJourneyByProspectId, getStepNameByStepId } from '../db/prospects';
import { createRefreshToken } from './token.store';
import {
  storeResetPasswordStartToken,
  getResetPasswordStartToken,
  storeResetPasswordPostOtpToken,
  getResetPasswordPostOtpToken,
} from './token.store';
import { nativeAuthSignIn, userFromIdToken } from './password.controller';
import type { IdpUserInfo } from './claims.helper';

const jwtService = new JWTService();

const CHALLENGE_TYPE_SSPR = 'oob redirect';

interface EntraContinuationResponse {
  continuation_token?: string;
  challenge_type?: string;
  error?: string;
  error_description?: string;
  continuation_token_new?: string;
  expires_in?: number;
}

function getCiamBaseUrl(): string | null {
  const tenantName = config.tenantName;
  if (!tenantName || !tenantName.trim()) return null;
  return `https://${tenantName.trim()}.ciamlogin.com/${tenantName.trim()}.onmicrosoft.com`;
}

function redactEmail(email: string): string {
  if (!email || email.length < 5) return '***';
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  const redactedLocal = local.length > 2 ? `${local.substring(0, 2)}***` : '***';
  return `${redactedLocal}@${domain}`;
}

async function nativeAuthPost(
  url: string,
  body: Record<string, string>,
  stepName: string
): Promise<{ status: number; data: EntraContinuationResponse }> {
  const safeBody = { ...body };
  if (safeBody.oob) safeBody.oob = '[REDACTED]';
  if (safeBody.new_password) safeBody.new_password = '[REDACTED]';
  if (safeBody.password) safeBody.password = '[REDACTED]';
  console.log('[PASSWORD_RESET]', stepName, { url: url.replace(/continuation_token=[^&]+/, 'continuation_token=***'), body: safeBody });
  const encoded = new URLSearchParams(body).toString();
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: encoded,
  });
  const data = (await res.json().catch(() => ({}))) as EntraContinuationResponse;
  return { status: res.status, data };
}

/**
 * POST /auth/password-reset/start
 * Start SSPR: call Entra resetpassword/start and resetpassword/challenge to send OTP.
 */
export async function passwordResetStart(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body as { email?: string };
    const email = body?.email;

    if (!email || typeof email !== 'string' || !email.trim()) {
      res.status(400).json({ error: 'email is required' });
      return;
    }

    const emailTrimmed = email.trim().toLowerCase();
    if (!emailTrimmed.includes('@') || emailTrimmed.split('@').length !== 2) {
      res.status(400).json({ error: 'Invalid email format' });
      return;
    }

    const baseUrl = getCiamBaseUrl();
    if (!baseUrl) {
      res.status(503).json({
        error: 'native_auth_unavailable',
        error_description: 'Password reset is not configured (ENTRA_TENANT_NAME required)',
      });
      return;
    }

    const clientId = config.clientId;

    const startUrl = `${baseUrl}/resetpassword/v1.0/start`;
    const startRes = await nativeAuthPost(
      startUrl,
      {
        client_id: clientId,
        challenge_type: CHALLENGE_TYPE_SSPR,
        username: emailTrimmed,
      },
      'resetpassword/start'
    );
    const startData = startRes.data;

    if (startRes.status !== 200) {
      console.warn('[PASSWORD_RESET_START] start FAILED', { status: startRes.status, error: startData.error, error_description: startData.error_description });
      if (startData.error === 'user_not_found') {
        res.status(400).json({ error: 'user_not_found', error_description: 'No account found with this email' });
        return;
      }
      res.status(400).json({
        error: startData.error || 'reset_failed',
        error_description: startData.error_description || 'Failed to start password reset',
      });
      return;
    }

    if (startData.challenge_type === 'redirect') {
      res.status(400).json({
        error: 'redirect_required',
        error_description: 'Web-based password reset is required',
      });
      return;
    }

    let continuationToken = startData.continuation_token;
    if (!continuationToken) {
      res.status(500).json({ error: 'reset_failed', error_description: 'Failed to start password reset' });
      return;
    }

    const challengeUrl = `${baseUrl}/resetpassword/v1.0/challenge`;
    const challengeRes = await nativeAuthPost(
      challengeUrl,
      {
        client_id: clientId,
        challenge_type: CHALLENGE_TYPE_SSPR,
        continuation_token: continuationToken,
      },
      'resetpassword/challenge'
    );
    const challengeData = challengeRes.data;

    if (challengeRes.status !== 200) {
      console.warn('[PASSWORD_RESET_START] challenge FAILED', { status: challengeRes.status, error: challengeData.error });
      res.status(400).json({
        error: 'reset_failed',
        error_description: challengeData.error_description || 'Failed to send verification code',
      });
      return;
    }

    if (challengeData.challenge_type === 'redirect') {
      res.status(400).json({ error: 'redirect_required', error_description: 'Web-based password reset is required' });
      return;
    }

    continuationToken =
      challengeData.continuation_token ?? (challengeData as { continuation_token_new?: string }).continuation_token_new ?? continuationToken;
    if (!continuationToken) {
      res.status(500).json({ error: 'reset_failed', error_description: 'Failed to send verification code' });
      return;
    }

    storeResetPasswordStartToken(emailTrimmed, continuationToken);

    res.status(200).json({
      message: 'Verification code sent to your email',
      email: redactEmail(emailTrimmed),
    });
  } catch (error) {
    console.error('[PASSWORD_RESET_START] Error:', error instanceof Error ? error.message : error);
    res.status(500).json({
      error: 'server_error',
      error_description: 'Password reset start failed',
    });
  }
}

/**
 * POST /auth/password-reset/verify-otp
 * Verify OTP and store continuation token for submit-password.
 */
export async function passwordResetVerifyOtp(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body as { email?: string; code?: string };
    const email = body?.email;
    const code = body?.code;

    if (!email || typeof email !== 'string' || !email.trim()) {
      res.status(400).json({ error: 'email is required' });
      return;
    }
    if (!code || typeof code !== 'string' || !code.trim()) {
      res.status(400).json({ error: 'code is required' });
      return;
    }

    const emailTrimmed = email.trim().toLowerCase();

    const continuationToken = getResetPasswordStartToken(emailTrimmed);
    if (!continuationToken) {
      res.status(401).json({
        error: 'expired_token',
        error_description: 'Reset session expired. Please start password reset again.',
      });
      return;
    }

    const baseUrl = getCiamBaseUrl();
    if (!baseUrl) {
      res.status(503).json({
        error: 'native_auth_unavailable',
        error_description: 'Password reset is not configured',
      });
      return;
    }

    const continueUrl = `${baseUrl}/resetpassword/v1.0/continue`;
    const continueRes = await nativeAuthPost(
      continueUrl,
      {
        continuation_token: continuationToken,
        client_id: config.clientId,
        grant_type: 'oob',
        oob: code.trim(),
      },
      'resetpassword/continue'
    );
    const continueData = continueRes.data;

    if (continueRes.status !== 200) {
      console.warn('[PASSWORD_RESET_VERIFY_OTP] continue FAILED', { status: continueRes.status, error: continueData.error });
      res.status(400).json({
        error: continueData.error || 'invalid_grant',
        error_description: continueData.error_description || 'Invalid or expired verification code',
      });
      return;
    }

    const newToken =
      continueData.continuation_token ?? (continueData as { continuation_token_new?: string }).continuation_token_new;
    if (!newToken) {
      res.status(500).json({ error: 'reset_failed', error_description: 'Failed to verify code' });
      return;
    }

    storeResetPasswordPostOtpToken(emailTrimmed, newToken);

    res.status(200).json({
      message: 'Code verified. Proceed to set new password.',
    });
  } catch (error) {
    console.error('[PASSWORD_RESET_VERIFY_OTP] Error:', error instanceof Error ? error.message : error);
    res.status(500).json({
      error: 'server_error',
      error_description: 'Verification failed',
    });
  }
}

/**
 * POST /auth/password-reset/submit-password
 * Submit new password to Entra, then sign in and return same response shape as signup submit-password / sign-in.
 */
export async function passwordResetSubmitPassword(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body as { email?: string; new_password?: string };
    const email = body?.email;
    const new_password = body?.new_password;

    if (!email || typeof email !== 'string' || !email.trim()) {
      res.status(400).json({ error: 'email is required' });
      return;
    }
    if (!new_password || typeof new_password !== 'string') {
      res.status(400).json({ error: 'new_password is required' });
      return;
    }

    const emailTrimmed = email.trim().toLowerCase();

    const continuationToken = getResetPasswordPostOtpToken(emailTrimmed);
    if (!continuationToken) {
      res.status(401).json({
        error: 'expired_token',
        error_description: 'Reset session expired. Please start password reset again.',
      });
      return;
    }

    const baseUrl = getCiamBaseUrl();
    if (!baseUrl) {
      res.status(503).json({
        error: 'native_auth_unavailable',
        error_description: 'Password reset is not configured',
      });
      return;
    }

    const submitUrl = `${baseUrl}/resetpassword/v1.0/submit`;
    const submitRes = await nativeAuthPost(
      submitUrl,
      {
        continuation_token: continuationToken,
        client_id: config.clientId,
        new_password: new_password,
      },
      'resetpassword/submit'
    );
    const submitData = submitRes.data;

    if (submitRes.status !== 200) {
      console.warn('[PASSWORD_RESET_SUBMIT_PASSWORD] submit FAILED', {
        status: submitRes.status,
        error: submitData.error,
        suberror: (submitData as { suberror?: string }).suberror,
      });
      const suberror = (submitData as { suberror?: string }).suberror;
      res.status(400).json({
        error: submitData.error || 'invalid_grant',
        error_description: submitData.error_description || 'Password reset failed',
        ...(suberror && { suberror }),
      });
      return;
    }

    // Password updated. Wait briefly for Entra to propagate the new password, then sign in.
    const SIGN_IN_DELAY_MS = 1500;
    const RETRY_DELAY_MS = 2000;
    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    const isRetryableSignInError = (err: unknown): boolean => {
      const msg = err instanceof Error ? err.message : String(err);
      const lower = msg.toLowerCase();
      return (
        lower.includes('password_expired') ||
        lower.includes('user_password_expired') ||
        lower.includes('aadsts50055') ||
        lower.includes('expired')
      );
    };

    let tokens: { id_token?: string; access_token?: string; expires_in?: number };
    try {
      await sleep(SIGN_IN_DELAY_MS);
      try {
        tokens = await nativeAuthSignIn(emailTrimmed, new_password);
      } catch (firstErr) {
        if (isRetryableSignInError(firstErr)) {
          await sleep(RETRY_DELAY_MS);
          tokens = await nativeAuthSignIn(emailTrimmed, new_password);
        } else {
          throw firstErr;
        }
      }
    } catch (entraErr) {
      const errMsg = entraErr instanceof Error ? entraErr.message : String(entraErr);
      console.warn('[PASSWORD_RESET_SUBMIT_PASSWORD] Sign-in after reset failed:', errMsg);
      res.status(200).json({
        message: 'Password reset successfully. Please sign in with your new password.',
        sign_in_after_reset_failed: true,
        sign_in_error: errMsg,
      });
      return;
    }

    const idToken = tokens!.id_token;
    if (!idToken) {
      res.status(200).json({
        message: 'Password reset successfully. Please sign in with your new password.',
        sign_in_after_reset_failed: true,
        sign_in_error: 'No id_token returned after sign-in.',
      });
      return;
    }

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
      const errMsg = decodeErr instanceof Error ? decodeErr.message : String(decodeErr);
      res.status(200).json({
        message: 'Password reset successfully. Please sign in with your new password.',
        sign_in_after_reset_failed: true,
        sign_in_error: errMsg,
      });
      return;
    }

    if (!userInfo.email || !userInfo.email.trim()) {
      userInfo = { ...userInfo, email: emailTrimmed };
    }

    const idpUser: IdpUserInfo = {
      objectId: userInfo.objectId,
      email: userInfo.email,
      name: userInfo.name,
      roles: userInfo.roles,
      groups: userInfo.groups,
    };

    let apiClaims: Awaited<ReturnType<typeof getClaimsByEmail>> = null;
    try {
      apiClaims = await getClaimsByEmail(userInfo.email);
      if (!apiClaims) {
        await syncPersonFromEntra(userInfo.objectId, userInfo.email, userInfo.name, personaCodeFromEntra);
        apiClaims = await getClaimsByEmail(userInfo.email);
      }
    } catch (e) {
      console.warn('[PASSWORD_RESET_SUBMIT_PASSWORD] getClaimsByEmail/sync failed:', e instanceof Error ? e.message : e);
    }

    const jwtPayload = buildUserClaims(idpUser, apiClaims);
    const accessToken = jwtService.sign(jwtPayload);
    const expiresInSeconds = config.jwtExpirationMinutes * 60;
    const refreshToken = createRefreshToken(jwtPayload);
    const refresh_expiry_time = config.refreshTokenExpirationDays * 24 * 60 * 60;

    let journey_status = 'SIGNED_IN';
    try {
      const prospect = await getProspectByEmail(userInfo.email);
      const prospectId = prospect ? Number(prospect.id ?? prospect.prospect_id) : null;
      if (prospectId != null && Number.isFinite(prospectId)) {
        const latestJourney = await getLatestRegistrationJourneyByProspectId(prospectId);
        if (latestJourney) {
          const stepName = await getStepNameByStepId(latestJourney.current_step_id);
          journey_status = stepName ?? latestJourney.status ?? `STEP_${latestJourney.current_step_id}`;
        }
      }
    } catch (err) {
      console.warn('[PASSWORD_RESET_SUBMIT_PASSWORD] journey_status lookup failed:', err instanceof Error ? err.message : err);
    }

    res.status(200).json({
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: expiresInSeconds,
      refresh_token: refreshToken,
      journey_status,
      person_id: apiClaims?.personId,
      refresh_expiry_time,
    });
  } catch (error) {
    console.error('[PASSWORD_RESET_SUBMIT_PASSWORD] Error:', error instanceof Error ? error.message : error);
    res.status(500).json({
      error: 'server_error',
      error_description: 'Password reset failed',
    });
  }
}
