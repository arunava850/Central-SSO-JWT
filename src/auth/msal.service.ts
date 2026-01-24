import { ConfidentialClientApplication, AuthenticationResult, AccountInfo } from '@azure/msal-node';
import { config } from '../config';

export interface UserInfo {
  objectId: string;
  email: string;
  name: string;
  roles: string[];
  groups: string[];
}

// Microsoft Graph API response types
interface GraphUserProfile {
  id: string;
  mail?: string;
  userPrincipalName?: string;
  displayName?: string;
  givenName?: string;
}

interface AppRoleAssignment {
  appRoleId: string;
  id: string;
  principalId: string;
  resourceId: string;
}

interface GraphAppRoleAssignmentsResponse {
  value: AppRoleAssignment[];
}

interface GraphGroup {
  id: string;
  displayName?: string;
}

interface GraphGroupsResponse {
  value: GraphGroup[];
}

export class MSALService {
  private msalClient: ConfidentialClientApplication;
  private readonly scopes: string[];

  constructor() {
    this.scopes = [
      'openid',
      'profile',
      'email',
      'User.Read',
      'GroupMember.Read.All',
      'Directory.Read.All',
    ];

    // Determine authority URL - use CIAM format if tenant name is provided
    let authority: string;
    if (config.tenantName) {
      // CIAM format: https://{tenant-name}.ciamlogin.com/{tenant-id}
      authority = `https://${config.tenantName}.ciamlogin.com/${config.tenantId}`;
    } else {
      // Standard Entra ID format: https://login.microsoftonline.com/{tenant-id}
      authority = `https://login.microsoftonline.com/${config.tenantId}`;
    }

    this.msalClient = new ConfidentialClientApplication({
      auth: {
        clientId: config.clientId,
        authority: authority,
        clientSecret: config.clientSecret,
      },
    });
    
    console.log(`[MSAL] Initialized with authority: ${authority}`);
  }

  /**
   * Get authorization URL for login
   */
  getAuthCodeUrl(redirectUri: string, state: string, codeVerifier: string, nonce: string): Promise<string> {
    return this.msalClient.getAuthCodeUrl({
      scopes: this.scopes,
      redirectUri,
      state,
      codeChallenge: this.generateCodeChallenge(codeVerifier),
      codeChallengeMethod: 'S256',
      nonce,
      responseMode: 'query',
    });
  }

  /**
   * Exchange authorization code for tokens
   */
  async acquireTokenByCode(
    code: string,
    redirectUri: string,
    codeVerifier: string
  ): Promise<AuthenticationResult> {
    try {
      const result = await this.msalClient.acquireTokenByCode({
        code,
        scopes: this.scopes,
        redirectUri,
        codeVerifier,
      });

      if (!result || !result.account) {
        throw new Error('Failed to acquire token: No account returned');
      }

      return result;
    } catch (error) {
      console.error('Error acquiring token by code:', error);
      throw new Error(`Failed to acquire token: ${error}`);
    }
  }

  /**
   * Get user information including roles and groups
   */
  async getUserInfo(accessToken: string): Promise<UserInfo> {
    try {
      // Fetch user profile
      const profileResponse = await fetch('https://graph.microsoft.com/v1.0/me', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!profileResponse.ok) {
        throw new Error(`Failed to fetch user profile: ${profileResponse.statusText}`);
      }

      const profile = await profileResponse.json() as GraphUserProfile;

      // Fetch user roles (app roles assigned to the user)
      const rolesResponse = await fetch('https://graph.microsoft.com/v1.0/me/appRoleAssignments', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      let roles: string[] = [];
      if (rolesResponse.ok) {
        const rolesData = await rolesResponse.json() as GraphAppRoleAssignmentsResponse;
        // Extract role names from appRoleAssignments
        // Note: You may need to map role IDs to names based on your app registration
        roles = rolesData.value?.map((assignment) => assignment.appRoleId) || [];
      }

      // Fetch user groups
      const groupsResponse = await fetch('https://graph.microsoft.com/v1.0/me/memberOf', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      let groups: string[] = [];
      if (groupsResponse.ok) {
        const groupsData = await groupsResponse.json() as GraphGroupsResponse;
        groups = groupsData.value?.map((group) => group.displayName || group.id) || [];
      }

      return {
        objectId: profile.id,
        email: profile.mail || profile.userPrincipalName || '',
        name: profile.displayName || profile.givenName || 'Unknown',
        roles,
        groups,
      };
    } catch (error) {
      console.error('Error fetching user info:', error);
      throw new Error(`Failed to fetch user information: ${error}`);
    }
  }

  /**
   * Generate code challenge for PKCE
   */
  private generateCodeChallenge(codeVerifier: string): string {
    const { createHash } = require('crypto');
    return createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');
  }
}
