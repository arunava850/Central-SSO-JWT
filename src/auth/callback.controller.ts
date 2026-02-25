import { Request, Response } from 'express';
import { MSALService } from './msal.service';
import { GoogleOAuthService } from './google.service';
import { JWTService } from '../jwt/jwt.service';
import { config } from '../config';
import { getSession, deleteSession, getSessionCount } from './session.store';
import { createExchangeCode, createRefreshToken } from './token.store';
import { buildUserClaims } from './claims.helper';
import { getClaimsByEmail } from '../db/get-claims-by-email';
import { syncPersonFromEntra } from '../db/sync-person-from-entra';
import { getProspectByEmail, createProspect, createRegistrationJourneyByStepId } from '../db/prospects';

const msalService = new MSALService();

// Only instantiate Google OAuth service if credentials are provided
let googleService: GoogleOAuthService | null = null;
if (config.googleClientId && config.googleClientSecret) {
  try {
    googleService = new GoogleOAuthService();
  } catch (error) {
    console.warn('[CALLBACK] Failed to initialize Google OAuth service:', error);
    googleService = null;
  }
}
const jwtService = new JWTService();

/**
 * Callback endpoint - handles OAuth2 callback from Microsoft Entra ID or Google
 * GET /auth/callback?code=xxx&state=xxx
 * 
 * Provider is determined from session data, not query parameter (for security)
 */
export async function callback(req: Request, res: Response): Promise<void> {
  try {
    const { code, state, error, error_description } = req.query;

    // Handle OAuth errors
    if (error) {
      console.error('OAuth error:', error, error_description);
      res.status(400).json({ 
        error: 'Authentication failed', 
        error_description: error_description || error 
      });
      return;
    }

    // Validate required parameters
    if (!code || typeof code !== 'string') {
      res.status(400).json({ error: 'Authorization code is required' });
      return;
    }

    if (!state || typeof state !== 'string') {
      res.status(400).json({ error: 'State parameter is required' });
      return;
    }

    // Verify state matches cookie (CSRF protection)
    const cookieState = req.cookies?.auth_state;
    if (cookieState !== state) {
      res.status(400).json({ error: 'Invalid state parameter' });
      return;
    }

    // Retrieve session data from shared session store
    const sessionData = getSession(state);
    if (!sessionData) {
      console.error(`[CALLBACK] Session not found for state: ${state.substring(0, 8)}...`);
      console.error(`[CALLBACK] Available sessions: ${getSessionCount()}`);
      console.error(`[CALLBACK] Cookie state: ${cookieState?.substring(0, 8)}...`);
      res.status(400).json({ 
        error: 'Session expired or invalid',
        details: 'The authentication session was not found. This may happen if the service was restarted or the session expired.'
      });
      return;
    }

    // Determine provider from session data (source of truth)
    // Don't trust query parameter - use session data to prevent provider confusion
    const authProvider = (sessionData.provider || 'microsoft').toLowerCase();
    
    // Log for debugging
    console.log(`[CALLBACK] Provider: ${authProvider}, State: ${state.substring(0, 8)}...`);
    
    // Clean up session
    deleteSession(state);
    res.clearCookie('auth_state');

    let userInfo: { objectId: string; email: string; name: string; roles: string[]; groups: string[] };
    let tenantId: string;
    let personaCodeFromEntra: string | undefined;

    if (authProvider === 'google') {
      if (!googleService) {
        throw new Error('Google OAuth is not configured');
      }

      // Exchange authorization code for tokens
      console.log('[CALLBACK] Exchanging Google authorization code for tokens...');
      const tokens = await googleService.getTokens(code as string);
      console.log('[CALLBACK] Google tokens acquired successfully');

      // Fetch user information from Google
      console.log('[CALLBACK] Fetching user info from Google...');
      userInfo = await googleService.getUserInfo(tokens.accessToken);
      console.log('[CALLBACK] Google user info retrieved:', { email: userInfo.email, name: userInfo.name });

      // Use Google user ID as objectId, and set tenant to 'google'
      tenantId = 'google';
    } else {
      // Microsoft Entra ID flow
      console.log('[CALLBACK] Exchanging Microsoft authorization code for tokens...');
      console.log('[CALLBACK] Callback URL:', `${config.baseUrl}/auth/callback`);
      const tokenResult = await msalService.acquireTokenByCode(
        code as string,
        `${config.baseUrl}/auth/callback`,
        sessionData.codeVerifier
      );

      if (!tokenResult.accessToken || !tokenResult.account) {
        console.error('[CALLBACK] Failed to acquire token - missing accessToken or account');
        throw new Error('Failed to acquire access token');
      }

      console.log('[CALLBACK] Microsoft tokens acquired successfully');
      console.log('[CALLBACK] Account ID:', tokenResult.account.homeAccountId);

      const claims = tokenResult.idTokenClaims as Record<string, unknown> | undefined;
      const rawPersona = claims?.Persona ?? claims?.persona;
      const roleStr = rawPersona != null ? String(rawPersona).trim() : '';
      personaCodeFromEntra = roleStr || 'P1002';
      console.log('[CALLBACK] Entra Persona claim:', personaCodeFromEntra);

      // Nonce validation is handled by MSAL

      // Fetch user information; Graph not required (roles/groups unused). On failure use ID token claims so first-time login still works.
      try {
        console.log('[CALLBACK] Fetching user info from Microsoft Graph...');
        userInfo = await msalService.getUserInfo(tokenResult.accessToken);
        console.log('[CALLBACK] Microsoft user info retrieved:', { email: userInfo.email, name: userInfo.name });
      } catch (graphErr) {
        console.warn('[CALLBACK] Graph user info failed, using ID token claims:', graphErr instanceof Error ? graphErr.message : String(graphErr));
        const idClaims = tokenResult.idTokenClaims as Record<string, unknown> | undefined;
        const account = tokenResult.account;
        const objectId = (account?.localAccountId ?? idClaims?.oid ?? idClaims?.sub) as string | undefined;
        const email = (idClaims?.email ?? idClaims?.preferred_username) as string | undefined;
        const name = (idClaims?.name ?? idClaims?.given_name) as string | undefined;
        console.log('[CALLBACK] ID token fallback: idClaims.email=', idClaims?.email ?? '(missing)', 'preferred_username=', idClaims?.preferred_username ?? '(missing)', '-> resolved email=', (email ?? '') === '' ? '(empty)' : String(email).substring(0, 5) + '***');
        userInfo = {
          objectId: objectId ?? '',
          email: email ?? '',
          name: name ?? email ?? 'Unknown',
          roles: [],
          groups: [],
        };
        console.log('[CALLBACK] Using ID token claims:', { email: userInfo.email, name: userInfo.name });
      }
      tenantId = config.tenantId;
    }

    const emailTrimmed = (userInfo.email || '').trim().toLowerCase();

    // Load claims from DB by email (aud, apps, personId, status); fall back to defaults if DB not configured or no rows
    const idpUser = {
      objectId: userInfo.objectId,
      email: userInfo.email,
      name: userInfo.name,
      roles: userInfo.roles,
      groups: userInfo.groups,
    };
    let apiClaims: Awaited<ReturnType<typeof getClaimsByEmail>> = null;
    let personJustCreated = false;
    try {
      console.log('[CALLBACK] Fetching DB claims for email:', userInfo.email);
      apiClaims = await getClaimsByEmail(userInfo.email);
      if (apiClaims) {
        console.log('[CALLBACK] DB claims loaded for', userInfo.email, '| aud:', apiClaims.aud?.length ?? 0, 'apps, personId:', apiClaims.personId, 'personUuid:', apiClaims.personUuid);
      } else {
        personJustCreated = true;
        console.log('[CALLBACK] No DB claims (null), syncing person from Entra then re-fetching');
        console.log('[CALLBACK] Passing to syncPersonFromEntra: email=', userInfo.email === '' ? '(empty string)' : userInfo.email.substring(0, 5) + '***', 'name=', userInfo.name ?? '(null)', 'objectId=', userInfo.objectId);
        await syncPersonFromEntra(userInfo.objectId, userInfo.email, userInfo.name, personaCodeFromEntra);
        apiClaims = await getClaimsByEmail(userInfo.email);
        if (apiClaims) {
          console.log('[CALLBACK] DB claims loaded after sync for', userInfo.email);
        } else {
          console.log('[CALLBACK] No DB claims after sync, will use default/mock claims');
        }
      }
    } catch (e) {
      console.warn('[CALLBACK] getClaimsByEmail failed, using defaults:', e instanceof Error ? e.message : e);
    }

    if (emailTrimmed) {
      try {
        let prospect = await getProspectByEmail(emailTrimmed);
        if (!prospect) {
          prospect = await createProspect(emailTrimmed, 'redirect', 'system', { mode: 'insert' });
        }
        if (apiClaims) {
          await createProspect(emailTrimmed, undefined, undefined, { person_uuid: apiClaims.personId, mode: 'update' });
        }
        if (personJustCreated && apiClaims && prospect) {
          const prospectId = Number(prospect.prospect_id ?? prospect.id);
          if (Number.isFinite(prospectId)) {
            await createRegistrationJourneyByStepId(prospectId, 50, 'COMPLETED', null);
            await createRegistrationJourneyByStepId(prospectId, 60, 'COMPLETED', null);
          }
        }
      } catch (e) {
        console.warn('[CALLBACK] Prospect/registration_journey failed, continuing:', e instanceof Error ? e.message : e);
      }
    }

    console.log('[CALLBACK] Building user claims and generating JWT...');
    const jwtPayload = buildUserClaims(idpUser, apiClaims);
    console.log('[CALLBACK] Signing JWT with payload sub:', jwtPayload.sub, 'aud:', (jwtPayload as { aud?: string[] }).aud ?? 'config default');
    const accessToken = jwtService.sign(jwtPayload);
    const expiresInSeconds = config.jwtExpirationMinutes * 60;
    console.log('[CALLBACK] JWT token generated successfully');

    // Create refresh token for token refresh endpoint
    const refreshToken = createRefreshToken(jwtPayload);

    // Create one-time exchange code (spoke app will exchange for access_token server-side)
    const exchangeCode = createExchangeCode(
      accessToken,
      sessionData.clientId,
      expiresInSeconds,
      refreshToken
    );

    // Redirect back to spoke app with code (not token in URL for security)
    console.log(`[CALLBACK] Preparing redirect to spoke app: ${sessionData.redirectUri}`);
    const redirectUri = new URL(sessionData.redirectUri);
    redirectUri.searchParams.set('code', exchangeCode);
    redirectUri.searchParams.set('state', state); // Echo state for spoke app validation

    const finalRedirectUrl = redirectUri.toString();
    console.log(`[CALLBACK] Redirecting to spoke app with exchange code: ${finalRedirectUrl.substring(0, 100)}...`);
    res.redirect(finalRedirectUrl);
  } catch (error) {
    console.error('[CALLBACK] Error in callback handler:', error);
    console.error('[CALLBACK] Error details:', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      name: error instanceof Error ? error.name : typeof error
    });
    
    // Don't redirect to login - return error response instead
    res.status(500).json({ 
      error: 'Authentication callback failed',
      message: error instanceof Error ? error.message : String(error)
    });
  }
}
