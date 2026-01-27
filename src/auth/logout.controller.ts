import { Request, Response } from 'express';
import { config } from '../config';

/**
 * Logout endpoint - handles user logout
 * 
 * Since we use stateless JWTs, logout is primarily client-side (remove token).
 * This endpoint optionally:
 * 1. Redirects to IdP logout endpoint (to clear IdP session)
 * 2. Redirects to post-logout URL
 * 
 * GET /auth/logout?post_logout_redirect_uri=xxx&provider=microsoft|google
 */
export async function logout(req: Request, res: Response): Promise<void> {
  try {
    const { post_logout_redirect_uri, provider = 'microsoft' } = req.query;

    console.log(`[LOGOUT] Logout requested, provider: ${provider}`);

    // Default post-logout redirect
    const defaultRedirectUri = post_logout_redirect_uri 
      ? decodeURIComponent(post_logout_redirect_uri as string)
      : config.baseUrl;

    // Validate post_logout_redirect_uri if provided
    if (post_logout_redirect_uri) {
      const normalizedUri = decodeURIComponent(post_logout_redirect_uri as string);
      // Optionally validate against allowed list (similar to redirect_uri validation)
      // For now, we allow any redirect for logout
      console.log(`[LOGOUT] Post-logout redirect: ${normalizedUri}`);
    }

    const authProvider = (provider as string).toLowerCase();

    // For stateless JWTs, the token is already invalid on the client side
    // We can optionally redirect to IdP logout to clear the IdP session
    
    if (authProvider === 'google') {
      // Google OAuth logout
      // Google doesn't have a standard logout endpoint, but we can redirect to
      // Google's account chooser which effectively logs out
      const googleLogoutUrl = `https://accounts.google.com/logout?continue=${encodeURIComponent(defaultRedirectUri)}`;
      console.log(`[LOGOUT] Redirecting to Google logout: ${googleLogoutUrl.substring(0, 100)}...`);
      res.redirect(googleLogoutUrl);
      return;
    } else {
      // Microsoft Entra ID logout
      // Use Microsoft's end_session_endpoint
      const tenantId = config.tenantId;
      const tenantName = config.tenantName;
      
      // Determine authority URL (same logic as login)
      let authority: string;
      if (tenantName) {
        // CIAM format
        authority = `https://${tenantName}.ciamlogin.com/${tenantId}`;
      } else {
        // Standard format
        authority = `https://login.microsoftonline.com/${tenantId}`;
      }
      
      // Microsoft end_session_endpoint
      // For CIAM: https://{tenant-name}.ciamlogin.com/{tenant-id}/oauth2/v2.0/logout
      // For Standard: https://login.microsoftonline.com/{tenant-id}/oauth2/v2.0/logout
      let endSessionUrl: string;
      if (tenantName) {
        // CIAM format
        endSessionUrl = `https://${tenantName}.ciamlogin.com/${tenantId}/oauth2/v2.0/logout`;
      } else {
        // Standard format
        endSessionUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/logout`;
      }
      
      const logoutParams = new URLSearchParams({
        post_logout_redirect_uri: defaultRedirectUri,
      });
      
      const microsoftLogoutUrl = `${endSessionUrl}?${logoutParams.toString()}`;
      console.log(`[LOGOUT] Redirecting to Microsoft logout: ${microsoftLogoutUrl.substring(0, 100)}...`);
      res.redirect(microsoftLogoutUrl);
      return;
    }
  } catch (error) {
    console.error('[LOGOUT] Logout error:', error);
    // On error, just redirect to base URL or provided redirect
    const redirectUri = req.query.post_logout_redirect_uri 
      ? decodeURIComponent(req.query.post_logout_redirect_uri as string)
      : config.baseUrl;
    res.redirect(redirectUri);
  }
}

/**
 * Simple logout endpoint - just redirects to post-logout URL
 * Use this if you don't need IdP session clearing
 * 
 * GET /auth/logout/simple?post_logout_redirect_uri=xxx
 */
export function simpleLogout(req: Request, res: Response): void {
  const { post_logout_redirect_uri } = req.query;
  
  const redirectUri = post_logout_redirect_uri 
    ? decodeURIComponent(post_logout_redirect_uri as string)
    : config.baseUrl;
  
  console.log(`[LOGOUT] Simple logout, redirecting to: ${redirectUri}`);
  res.redirect(redirectUri);
}
