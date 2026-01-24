import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { join } from 'path';

dotenv.config();

export interface Config {
  port: number;
  tenantId: string;
  tenantName?: string; // For CIAM: tenant name (e.g., "yourtenant")
  clientId: string;
  clientSecret: string;
  redirectUris: string[];
  jwtPrivateKey: string;
  jwtPublicKey: string;
  jwtExpirationMinutes: number;
  allowedOrigins: string[];
  baseUrl: string;
  httpsEnabled: boolean;
  sslKeyPath?: string;
  sslCertPath?: string;
  // Google OAuth (optional)
  googleClientId?: string;
  googleClientSecret?: string;
}

function loadKey(keyPath: string | undefined, envKey: string | undefined): string {
  if (keyPath) {
    try {
      return readFileSync(keyPath, 'utf8');
    } catch (error) {
      throw new Error(`Failed to load key from file ${keyPath}: ${error}`);
    }
  }
  
  if (envKey) {
    // Handle PEM format with escaped newlines
    return envKey.replace(/\\n/g, '\n');
  }
  
  throw new Error(`Neither ${keyPath} nor ${envKey} is provided`);
}

function parseRedirectUris(): string[] {
  const redirectUris = process.env.REDIRECT_URIS;
  if (!redirectUris) {
    throw new Error('REDIRECT_URIS environment variable is required');
  }
  return redirectUris.split(',').map(uri => uri.trim());
}

function parseAllowedOrigins(): string[] {
  const origins = process.env.ALLOWED_ORIGINS || process.env.REDIRECT_URIS || '';
  return origins.split(',').map(origin => origin.trim());
}

export const config: Config = {
  port: parseInt(process.env.PORT || '3000', 10),
  tenantId: process.env.TENANT_ID || '',
  tenantName: process.env.ENTRA_TENANT_NAME, // For CIAM: tenant name (e.g., "yourtenant")
  clientId: process.env.CLIENT_ID || '',
  clientSecret: process.env.CLIENT_SECRET || '',
  redirectUris: parseRedirectUris(),
  jwtPrivateKey: loadKey(process.env.JWT_PRIVATE_KEY_PATH, process.env.JWT_PRIVATE_KEY),
  jwtPublicKey: loadKey(process.env.JWT_PUBLIC_KEY_PATH, process.env.JWT_PUBLIC_KEY),
  jwtExpirationMinutes: parseInt(process.env.JWT_EXPIRATION_MINUTES || '15', 10),
  allowedOrigins: parseAllowedOrigins(),
  baseUrl: process.env.BASE_URL || 'https://localhost:3000',
  httpsEnabled: process.env.HTTPS_ENABLED !== 'false',
  sslKeyPath: process.env.SSL_KEY_PATH,
  sslCertPath: process.env.SSL_CERT_PATH,
  // Google OAuth (optional)
  googleClientId: process.env.GOOGLE_CLIENT_ID,
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
};

// Validate required configuration
const requiredFields: (keyof Config)[] = ['tenantId', 'clientId', 'clientSecret', 'jwtPrivateKey', 'jwtPublicKey'];
for (const field of requiredFields) {
  if (!config[field]) {
    throw new Error(`Missing required configuration: ${field}`);
  }
}

if (config.redirectUris.length === 0) {
  throw new Error('At least one REDIRECT_URI must be configured');
}
