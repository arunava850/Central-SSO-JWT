import { Request, Response } from 'express';
import { MSALService } from './msal.service';
import { GoogleOAuthService } from './google.service';
import { config } from '../config';
import { randomBytes } from 'crypto';
import { setSession } from './session.store';

const msalService = new MSALService();

// Only instantiate Google OAuth service if credentials are provided
// This prevents Google OAuth from being triggered accidentally
let googleService: GoogleOAuthService | null = null;
if (config.googleClientId && config.googleClientSecret) {
  try {
    googleService = new GoogleOAuthService();
    console.log('[INIT] Google OAuth service initialized');
  } catch (error) {
    console.warn('[INIT] Failed to initialize Google OAuth service:', error);
    googleService = null;
  }
} else {
  console.log('[INIT] Google OAuth not configured (GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET not set)');
}

/**
 * Login endpoint - initiates OAuth2 flow with Microsoft Entra ID or Google
 * GET /auth/login?client_id=xxx&redirect_uri=xxx&provider=microsoft|google
 */
export async function login(req: Request, res: Response): Promise<void> {
  try {
    const { client_id, redirect_uri, provider = 'microsoft' } = req.query;

    // Validate client_id (optional - can be used for multi-tenant scenarios)
    if (!client_id || typeof client_id !== 'string') {
      res.status(400).json({ error: 'client_id is required' });
      return;
    }

    // Validate redirect_uri
    if (!redirect_uri || typeof redirect_uri !== 'string') {
      res.status(400).json({ error: 'redirect_uri is required' });
      return;
    }

    // Verify redirect_uri is in allowed list
    // Decode and normalize the redirect URI (remove query parameters for comparison)
    const normalizedRedirectUri = decodeURIComponent(redirect_uri);
    const redirectUriBase = normalizedRedirectUri.split('?')[0]; // Remove query parameters
    
    // Check if base URI (without query params) matches any configured redirect URI
    const isValidRedirectUri = config.redirectUris.some(configuredUri => {
      const configuredBase = configuredUri.split('?')[0];
      return redirectUriBase === configuredBase;
    });
    
    if (!isValidRedirectUri) {
      console.warn(`[LOGIN] Invalid redirect_uri: ${redirectUriBase} (from: ${normalizedRedirectUri})`);
      console.warn(`[LOGIN] Configured redirect URIs:`, config.redirectUris);
      res.status(400).json({ 
        error: 'Invalid redirect_uri. Must be one of the configured redirect URIs.',
        received: redirectUriBase,
        configured: config.redirectUris
      });
      return;
    }
    
    console.log(`[LOGIN] Valid redirect_uri: ${redirectUriBase} (full: ${normalizedRedirectUri})`);

    // Generate PKCE code verifier and challenge
    const codeVerifier = base64UrlEncode(randomBytes(32));
    
    // Generate state for CSRF protection
    const state = base64UrlEncode(randomBytes(32));
    
    // Generate nonce for ID token validation
    const nonce = base64UrlEncode(randomBytes(32));

    // Validate provider - default to microsoft if not specified or invalid
    let authProvider = (provider as string || 'microsoft').toLowerCase().trim();
    
    // Normalize provider name
    if (authProvider !== 'microsoft' && authProvider !== 'google') {
      console.warn(`[LOGIN] Invalid provider "${authProvider}", defaulting to microsoft`);
      authProvider = 'microsoft';
    }

    // Ensure Google OAuth is configured if requested
    if (authProvider === 'google' && !googleService) {
      console.warn(`[LOGIN] Google OAuth requested but not configured, defaulting to Microsoft`);
      authProvider = 'microsoft';
    }

    // Store session data in shared session store
    setSession(state, {
      codeVerifier,
      nonce,
      redirectUri: normalizedRedirectUri,
      provider: authProvider as 'microsoft' | 'google',
      clientId: client_id as string,
    });

    // Set state in HTTP-only cookie for additional security
    res.cookie('auth_state', state, {
      httpOnly: true,
      secure: config.httpsEnabled,
      sameSite: 'lax',
      maxAge: 600000, // 10 minutes
    });

    // Get authorization URL based on provider
    let authUrl: string;
    if (authProvider === 'google' && googleService) {
      console.log(`[LOGIN] Provider: Google, State: ${state.substring(0, 8)}...`);
      authUrl = googleService.getAuthUrl(state, codeVerifier);
    } else {
      // Microsoft Entra ID (default)
      console.log(`[LOGIN] Provider: Microsoft, State: ${state.substring(0, 8)}...`);
      authUrl = await msalService.getAuthCodeUrl(
        `${config.baseUrl}/auth/callback`,
        state,
        codeVerifier,
        nonce
      );
    }
    
    // Log the redirect URL (first 100 chars only for security)
    console.log(`[LOGIN] Redirecting to: ${authUrl.substring(0, 100)}...`);

    // Redirect to identity provider login
    res.redirect(authUrl);
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Failed to initiate login' });
  }
}

/**
 * Base64 URL encode helper
 */
function base64UrlEncode(buffer: Buffer): string {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}
