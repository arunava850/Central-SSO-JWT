import { Request, Response } from 'express';
import { JWTService } from './jwt.service';

const jwtService = new JWTService();

/**
 * JWKS endpoint - exposes public keys for JWT verification
 * GET /.well-known/jwks.json
 */
export async function getJWKS(req: Request, res: Response): Promise<void> {
  try {
    const jwks = jwtService.getJWKS();
    
    // Set appropriate cache headers
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.setHeader('Content-Type', 'application/json');
    
    res.status(200).json(jwks);
  } catch (error) {
    console.error('Error generating JWKS:', error);
    res.status(500).json({ error: 'Failed to generate JWKS' });
  }
}
