import { Request, Response } from 'express';
import { MSALService } from './msal.service';
import { GoogleOAuthService } from './google.service';
import { JWTService } from '../jwt/jwt.service';
import { config } from '../config';
import { getSession, deleteSession, getSessionCount } from './session.store';

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

    if (authProvider === 'google') {
      if (!googleService) {
        throw new Error('Google OAuth is not configured');
      }

      // Exchange authorization code for tokens
      const tokens = await googleService.getTokens(code as string);

      // Fetch user information from Google
      userInfo = await googleService.getUserInfo(tokens.accessToken);

      // Use Google user ID as objectId, and set tenant to 'google'
      tenantId = 'google';
    } else {
      // Microsoft Entra ID flow
      const tokenResult = await msalService.acquireTokenByCode(
        code as string,
        `${config.baseUrl}/auth/callback`,
        sessionData.codeVerifier
      );

      if (!tokenResult.accessToken || !tokenResult.account) {
        throw new Error('Failed to acquire access token');
      }

      // Nonce validation is handled by MSAL

      // Fetch user information including roles and groups
      userInfo = await msalService.getUserInfo(tokenResult.accessToken);
      tenantId = config.tenantId;
    }

    // Generate JWT with user claims (same format regardless of provider)
    const jwtToken = jwtService.sign({
      sub: userInfo.objectId,
      email: userInfo.email,
      name: userInfo.name,
      roles: userInfo.roles,
      groups: userInfo.groups,
      tenant: tenantId,
    });

    // Redirect back to spoke app with JWT token
    const redirectUri = new URL(sessionData.redirectUri);
    redirectUri.searchParams.set('token', jwtToken);
    redirectUri.searchParams.set('state', state); // Echo state for spoke app validation

    res.redirect(redirectUri.toString());
  } catch (error) {
    console.error('Callback error:', error);
    res.status(500).json({ error: 'Authentication callback failed' });
  }
}
