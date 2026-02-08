import jwt from 'jsonwebtoken';
import { config } from '../config';
import { createHash, createPublicKey } from 'crypto';

/** Identity block inside the JWT */
export interface JWTIdentity {
  email: string;
  status: string;
  entra_uuid: string;
  Person_uuid: string;
}

/** Per-app claims */
export interface JWTAppClaims {
  uid: string;
  roles: string[];
}

/** Full JWT payload (platform token shape) */
export interface JWTPayload {
  iss?: string;
  sub: string;
  aud?: string[];
  exp?: number;
  iat?: number;
  identity: JWTIdentity;
  apps: Record<string, JWTAppClaims>;
}

/** Payload input for sign() – service adds iss, aud, iat, exp */
export type JWTPayloadInput = Omit<JWTPayload, 'iat' | 'exp' | 'iss' | 'aud'>;

export interface JWK {
  kty: string;
  use: string;
  kid: string;
  n: string;
  e: string;
  alg: string;
}

export class JWTService {
  private readonly privateKey: string;
  private readonly publicKey: string;
  private readonly issuer: string;
  private readonly audience: string[];
  private readonly keyId: string;

  constructor() {
    this.privateKey = config.jwtPrivateKey;
    this.publicKey = config.jwtPublicKey;
    this.issuer = config.jwtIssuer;
    this.audience = config.jwtAudience;
    this.keyId = this.generateKeyId();
  }

  /**
   * Generate a key ID (kid) from the public key
   */
  private generateKeyId(): string {
    const hash = createHash('sha256');
    hash.update(this.publicKey);
    return hash.digest('hex').substring(0, 16);
  }

  /**
   * Sign a JWT with RS256
   */
  sign(payload: JWTPayloadInput): string {
    const now = Math.floor(Date.now() / 1000);
    const expirationTime = now + (config.jwtExpirationMinutes * 60);

    const fullPayload: JWTPayload = {
      ...payload,
      iat: now,
      exp: expirationTime,
      iss: this.issuer,
      aud: this.audience,
    };

    return jwt.sign(fullPayload, this.privateKey, {
      algorithm: 'RS256',
      keyid: this.keyId,
    });
  }

  /**
   * Verify a JWT token
   */
  verify(token: string): JWTPayload {
    try {
      const decoded = jwt.verify(token, this.publicKey, {
        algorithms: ['RS256'],
        issuer: this.issuer,
        audience: this.audience.length > 0 ? (this.audience as [string, ...string[]]) : undefined,
      }) as unknown as JWTPayload;

      return decoded;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new Error('Token has expired');
      }
      if (error instanceof jwt.JsonWebTokenError) {
        throw new Error(`Invalid token: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Extract public key components for JWKS
   */
  private getPublicKeyComponents(): { n: string; e: string } {
    const keyObject = createPublicKey(this.publicKey);
    const jwk = keyObject.export({ format: 'jwk' });

    if (!jwk.n || !jwk.e) {
      throw new Error('Failed to extract public key components');
    }

    return {
      n: jwk.n,
      e: jwk.e,
    };
  }

  /**
   * Generate JWKS (JSON Web Key Set)
   */
  getJWKS(): { keys: JWK[] } {
    const { n, e } = this.getPublicKeyComponents();

    const jwk: JWK = {
      kty: 'RSA',
      use: 'sig',
      kid: this.keyId,
      n: n,
      e: e,
      alg: 'RS256',
    };

    return { keys: [jwk] };
  }

  /**
   * Get the key ID
   */
  getKeyId(): string {
    return this.keyId;
  }
}
