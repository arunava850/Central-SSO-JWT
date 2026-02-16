/**
 * POST /auth/token/password
 * Authenticate with Entra External ID Native Authentication (email/password), then issue
 * platform JWT and optional refresh token. For trusted clients (e.g. React Native) over HTTPS.
 * Uses oauth2/v2.0 API: initiate → challenge → token.
 */

import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { JWTService } from '../jwt/jwt.service';
import { buildUserClaims } from './claims.helper';
import { getClaimsByEmail } from '../db/get-claims-by-email';
import { syncPersonFromEntra } from '../db/sync-person-from-entra';
import { createRefreshToken } from './token.store';
import type { IdpUserInfo } from './claims.helper';

const jwtService = new JWTService();

const CHALLENGE_TYPE_PASSWORD = 'password redirect';
const GENERIC_AUTH_ERROR = { error: 'invalid_grant', error_description: 'Invalid username or password' };

/** Native Auth API response: start / continue */
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
    safe[k] = k.toLowerCase() === 'password' ? '[REDACTED]' : v;
  }
  return safe;
}

async function nativeAuthPost(
  url: string,
  body: Record<string, string>
): Promise<{ status: number; data: NativeAuthContinuationResponse | NativeAuthTokenResponse }> {
  console.warn('[PASSWORD_AUTH] Entra call', { url, body: redactBodyForLog(body) });
  const encoded = new URLSearchParams(body).toString();
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: encoded,
  });
  const data = (await res.json().catch(() => ({}))) as NativeAuthContinuationResponse | NativeAuthTokenResponse;
  return { status: res.status, data };
}

/**
 * Run Entra External ID Native Authentication sign-in (oauth2/v2.0: initiate → challenge → token).
 * Returns id_token and access_token on success; throws or returns error shape on failure.
 */
async function nativeAuthSignIn(
  username: string,
  password: string
): Promise<{ id_token?: string; access_token?: string; expires_in?: number }> {
  const baseUrl = getCiamBaseUrl();
  if (!baseUrl) {
    throw new Error('Native authentication is not configured (ENTRA_TENANT_NAME required for External ID)');
  }
  const clientId = config.clientId;

  // Step 1: oauth2/v2.0/initiate
  const initiateUrl = `${baseUrl}/oauth2/v2.0/initiate`;
  const initiateBody: Record<string, string> = {
    client_id: clientId,
    challenge_type: CHALLENGE_TYPE_PASSWORD,
    username: username.trim(),
  };
  const initiateRes = await nativeAuthPost(initiateUrl, initiateBody);
  const initiateData = initiateRes.data as NativeAuthContinuationResponse;

  if (initiateRes.status !== 200) {
    console.warn('[PASSWORD_AUTH] initiate FAILED', {
      status: initiateRes.status,
      error: initiateData.error,
      error_description: initiateData.error_description,
      full: initiateData,
    });
    throw new Error(initiateData.error_description || initiateData.error || 'Sign-in start failed');
  }
  if (initiateData.challenge_type === 'redirect') {
    throw new Error('Web redirect required');
  }
  let continuationToken = initiateData.continuation_token;
  if (!continuationToken) {
    throw new Error('No continuation token from initiate');
  }

  // Step 2: oauth2/v2.0/challenge (no password)
  const challengeUrl = `${baseUrl}/oauth2/v2.0/challenge`;
  const challengeBody: Record<string, string> = {
    client_id: clientId,
    challenge_type: CHALLENGE_TYPE_PASSWORD,
    continuation_token: continuationToken,
  };
  const challengeRes = await nativeAuthPost(challengeUrl, challengeBody);
  const challengeData = challengeRes.data as NativeAuthContinuationResponse;

  if (challengeRes.status !== 200) {
    console.warn('[PASSWORD_AUTH] challenge FAILED', {
      status: challengeRes.status,
      error: challengeData.error,
      error_description: challengeData.error_description,
      full: challengeData,
    });
    throw new Error(challengeData.error_description || challengeData.error || 'Invalid credentials');
  }
  continuationToken =
    challengeData.continuation_token ?? (challengeData as { continuation_token_new?: string }).continuation_token_new ?? continuationToken;
  if (!continuationToken) {
    throw new Error('No continuation token from challenge');
  }

  // Step 3: oauth2/v2.0/token (grant_type=password, password, scope)
  const tokenUrl = `${baseUrl}/oauth2/v2.0/token`;
  const tokenBody: Record<string, string> = {
    continuation_token: continuationToken,
    client_id: clientId,
    grant_type: 'password',
    password,
    scope: 'openid offline_access',
  };
  const tokenRes = await nativeAuthPost(tokenUrl, tokenBody);
  const tokenData = tokenRes.data as NativeAuthTokenResponse;

  if (tokenRes.status !== 200 || tokenData.error) {
    console.warn('[PASSWORD_AUTH] token FAILED', {
      status: tokenRes.status,
      error: tokenData.error,
      error_description: tokenData.error_description,
      full: { ...tokenData, access_token: tokenData.access_token ? '[REDACTED]' : undefined, id_token: tokenData.id_token ? '[REDACTED]' : undefined },
    });
    throw new Error(tokenData.error_description || tokenData.error || 'Token request failed');
  }
  return {
    id_token: tokenData.id_token,
    access_token: tokenData.access_token,
    expires_in: tokenData.expires_in,
  };
}

function userFromIdToken(idToken: string): IdpUserInfo & { personaCodeFromEntra: string } {
  const decoded = jwt.decode(idToken) as EntraIdTokenPayload | null;
  if (!decoded || typeof decoded !== 'object') {
    throw new Error('Invalid id_token');
  }
  const objectId = (decoded.oid ?? decoded.sub ?? '') as string;
  const email = (decoded.email ?? decoded.preferred_username ?? '') as string;
  const name = (decoded.name ?? decoded.given_name ?? email ?? 'Unknown') as string;
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

export async function passwordToken(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body as { username?: string; password?: string; client_id?: string };
    const username = body?.username;
    const password = body?.password;

    if (!username || typeof username !== 'string' || !username.trim()) {
      res.status(400).json({ error: 'username is required' });
      return;
    }
    if (!password || typeof password !== 'string') {
      res.status(400).json({ error: 'password is required' });
      return;
    }

    if (!getCiamBaseUrl()) {
      res.status(503).json({
        error: 'native_auth_unavailable',
        error_description: 'Password sign-in is not configured for this tenant (ENTRA_TENANT_NAME required)',
      });
      return;
    }

    let tokens: { id_token?: string; access_token?: string; expires_in?: number };
    try {
      tokens = await nativeAuthSignIn(username.trim(), password);
    } catch (entraErr) {
      console.warn('[PASSWORD_AUTH] Entra Native Auth failed:', entraErr instanceof Error ? entraErr.message : String(entraErr));
      res.status(401).json(GENERIC_AUTH_ERROR);
      return;
    }

    const idToken = tokens.id_token;
    if (!idToken) {
      console.warn('[PASSWORD_AUTH] No id_token in Entra response');
      res.status(401).json(GENERIC_AUTH_ERROR);
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
      console.warn('[PASSWORD_AUTH] id_token decode failed:', decodeErr instanceof Error ? decodeErr.message : String(decodeErr));
      res.status(401).json(GENERIC_AUTH_ERROR);
      return;
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
      console.warn('[PASSWORD_AUTH] getClaimsByEmail/sync failed, using defaults:', e instanceof Error ? e.message : e);
    }

    const jwtPayload = buildUserClaims(idpUser, apiClaims);
    const accessToken = jwtService.sign(jwtPayload);
    const expiresInSeconds = config.jwtExpirationMinutes * 60;
    const refreshToken = createRefreshToken(jwtPayload);

    res.status(200).json({
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: expiresInSeconds,
      refresh_token: refreshToken,
    });
  } catch (error) {
    console.error('[PASSWORD_AUTH] Error:', error instanceof Error ? error.message : error);
    res.status(500).json({
      error: 'server_error',
      error_description: 'Authentication failed',
    });
  }
}
