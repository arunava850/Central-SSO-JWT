import { OAuth2Client } from 'google-auth-library';
import { config } from '../config';

export interface GoogleUserInfo {
  objectId: string;
  email: string;
  name: string;
  roles: string[];
  groups: string[];
}

export class GoogleOAuthService {
  private oauth2Client: OAuth2Client;
  private readonly scopes: string[];

  constructor() {
    this.scopes = [
      'openid',
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/userinfo.email',
    ];

    // Note: Google OAuth redirect URI should NOT include query parameters
    // The provider is determined from session data in the callback
    this.oauth2Client = new OAuth2Client(
      config.googleClientId!,
      config.googleClientSecret!,
      `${config.baseUrl}/auth/callback`
    );
  }

  /**
   * Get authorization URL for Google login
   */
  getAuthUrl(state: string, codeVerifier: string): string {
    const codeChallenge = this.generateCodeChallenge(codeVerifier);
    
    const authUrl = this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: this.scopes,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256' as any, // Google library type definition issue
      prompt: 'consent', // Force consent screen to get refresh token
    });
    
    return authUrl;
  }

  /**
   * Exchange authorization code for tokens
   */
  async getTokens(code: string): Promise<{ accessToken: string; idToken?: string }> {
    try {
      const { tokens } = await this.oauth2Client.getToken(code);
      
      if (!tokens.access_token) {
        throw new Error('Failed to acquire access token');
      }

      return {
        accessToken: tokens.access_token,
        idToken: tokens.id_token || undefined,
      };
    } catch (error) {
      console.error('Error getting tokens:', error);
      throw new Error(`Failed to get tokens: ${error}`);
    }
  }

  /**
   * Get user information from Google
   */
  async getUserInfo(accessToken: string): Promise<GoogleUserInfo> {
    try {
      // Verify and decode ID token if available
      let userInfo: any = null;
      
      // Try to get user info from Google People API or userinfo endpoint
      const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch user info: ${response.statusText}`);
      }

      userInfo = await response.json();

      // Google doesn't have roles/groups in the same way as Entra ID
      // You can map Google Workspace groups if needed, or leave empty
      return {
        objectId: userInfo.id || userInfo.sub || '',
        email: userInfo.email || '',
        name: userInfo.name || userInfo.given_name || 'Unknown',
        roles: [], // Google OAuth doesn't provide roles by default
        groups: [], // Can be populated from Google Workspace Groups API if needed
      };
    } catch (error) {
      console.error('Error fetching user info:', error);
      throw new Error(`Failed to fetch user information: ${error}`);
    }
  }

  /**
   * Verify ID token from Google
   */
  async verifyIdToken(idToken: string): Promise<any> {
    try {
      const ticket = await this.oauth2Client.verifyIdToken({
        idToken,
        audience: config.googleClientId,
      });

      return ticket.getPayload();
    } catch (error) {
      console.error('Error verifying ID token:', error);
      throw new Error(`Failed to verify ID token: ${error}`);
    }
  }

  /**
   * Generate code challenge for PKCE
   */
  private generateCodeChallenge(codeVerifier: string): string {
    const crypto = require('crypto');
    return crypto
      .createHash('sha256')
      .update(codeVerifier)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }
}
