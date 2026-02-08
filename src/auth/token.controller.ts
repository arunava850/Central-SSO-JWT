import { Request, Response } from 'express';
import { JWTService } from '../jwt/jwt.service';
import { config } from '../config';
import { consumeExchangeCode, consumeRefreshToken, createRefreshToken } from './token.store';

const jwtService = new JWTService();

/**
 * POST /auth/token/exchange
 * Exchange a one-time exchange_code (from redirect) for platform JWT and optional refresh_token.
 * Body: { exchange_code: string, client_id: string }
 */
export async function exchangeToken(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body as { exchange_code?: string; client_id?: string };
    const exchangeCode = body?.exchange_code;
    const clientId = body?.client_id;

    if (!exchangeCode || typeof exchangeCode !== 'string') {
      res.status(400).json({ error: 'exchange_code is required' });
      return;
    }
    if (!clientId || typeof clientId !== 'string') {
      res.status(400).json({ error: 'client_id is required' });
      return;
    }

    const result = consumeExchangeCode(exchangeCode, clientId);
    if (!result) {
      res.status(400).json({
        error: 'invalid_grant',
        error_description: 'Exchange code invalid, expired, or already used',
      });
      return;
    }

    res.status(200).json({
      access_token: result.accessToken,
      token_type: 'Bearer',
      expires_in: result.expiresIn,
      ...(result.refreshToken && { refresh_token: result.refreshToken }),
    });
  } catch (error) {
    console.error('[TOKEN_EXCHANGE] Error:', error);
    res.status(500).json({
      error: 'server_error',
      error_description: error instanceof Error ? error.message : 'Token exchange failed',
    });
  }
}

/**
 * POST /auth/token/refresh
 * Renew platform JWT using a refresh token.
 * Body: { refresh_token: string }
 */
export async function refreshToken(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body as { refresh_token?: string };
    const refreshTokenValue = body?.refresh_token;

    if (!refreshTokenValue || typeof refreshTokenValue !== 'string') {
      res.status(400).json({ error: 'refresh_token is required' });
      return;
    }

    // Rotate: consume old refresh token and issue new JWT + new refresh token
    const payload = consumeRefreshToken(refreshTokenValue, true);
    if (!payload) {
      res.status(400).json({
        error: 'invalid_grant',
        error_description: 'Refresh token invalid or expired',
      });
      return;
    }

    const accessToken = jwtService.sign(payload);
    const expiresInSeconds = config.jwtExpirationMinutes * 60;
    const newRefreshToken = createRefreshToken(payload);

    res.status(200).json({
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: expiresInSeconds,
      refresh_token: newRefreshToken,
    });
  } catch (error) {
    console.error('[TOKEN_REFRESH] Error:', error);
    res.status(500).json({
      error: 'server_error',
      error_description: error instanceof Error ? error.message : 'Token refresh failed',
    });
  }
}
