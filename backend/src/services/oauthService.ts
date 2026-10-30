import { eq } from 'drizzle-orm';
import { db } from '../config/db';
import { tokens, type Token } from '../db/schema';
import { env } from '../config/env';
import { encrypt, decrypt } from '../utils/crypto';
import { AppError, BadRequestError } from '../utils/errors';

export interface HubspotTokenResponse {
  token_type: string;
  refresh_token: string;
  access_token: string;
  expires_in: number;
  hub_id?: number | string;
  app_id?: number;
  user_id?: number;
}

const HUBSPOT_TOKEN_URL = 'https://api.hubapi.com/oauth/v1/token';

/**
 * Exchanges HubSpot authorization code for access and refresh tokens.
 */
export const exchangeHubspotToken = async (
  authCode: string,
  redirectUri: string
): Promise<HubspotTokenResponse> => {
  if (!authCode) {
    throw new BadRequestError('Missing authorization code');
  }

  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: env.HUBSPOT_CLIENT_ID,
    client_secret: env.HUBSPOT_CLIENT_SECRET,
    redirect_uri: redirectUri,
    code: authCode,
  });

  const response = await fetch(HUBSPOT_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
    },
    body: params.toString(),
  });

  const data = (await response.json()) as Record<string, unknown>;

  if (!response.ok) {
    const errorMsg = (data.message as string) || (data.error as string) || 'Token exchange failed';
    console.error('HubSpot OAuth token exchange error:', data);
    throw new BadRequestError(`HubSpot OAuth error: ${errorMsg}`, data);
  }

  return data as unknown as HubspotTokenResponse;
};

/**
 * Encrypts and upserts HubSpot OAuth tokens in PostgreSQL using Drizzle ORM.
 * Updates on conflict targeting wixInstanceId to handle re-authentications smoothly.
 */
export const upsertHubspotTokens = async (
  wixInstanceId: string,
  tokenData: HubspotTokenResponse
): Promise<Token> => {
  if (!wixInstanceId) {
    throw new BadRequestError('wixInstanceId is required to store OAuth tokens');
  }

  const encryptedAccessToken = encrypt(tokenData.access_token);
  const encryptedRefreshToken = encrypt(tokenData.refresh_token);
  const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000);
  const portalId = tokenData.hub_id ? String(tokenData.hub_id) : null;

  const [savedToken] = await db
    .insert(tokens)
    .values({
      wixInstanceId,
      hubspotAccessToken: encryptedAccessToken,
      hubspotRefreshToken: encryptedRefreshToken,
      hubspotPortalId: portalId,
      tokenType: tokenData.token_type || 'bearer',
      expiresAt,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: tokens.wixInstanceId,
      set: {
        hubspotAccessToken: encryptedAccessToken,
        hubspotRefreshToken: encryptedRefreshToken,
        ...(portalId ? { hubspotPortalId: portalId } : {}),
        tokenType: tokenData.token_type || 'bearer',
        expiresAt,
        updatedAt: new Date(),
      },
    })
    .returning();

  return savedToken;
};

/**
 * Retrieves and decrypts stored HubSpot tokens for a Wix instance.
 */
export const getDecryptedTokens = async (
  wixInstanceId: string
): Promise<{
  wixInstanceId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  portalId: string | null;
} | null> => {
  const [tokenRecord] = await db
    .select()
    .from(tokens)
    .where(eq(tokens.wixInstanceId, wixInstanceId))
    .limit(1);

  if (!tokenRecord) {
    return null;
  }

  return {
    wixInstanceId: tokenRecord.wixInstanceId,
    accessToken: decrypt(tokenRecord.hubspotAccessToken),
    refreshToken: decrypt(tokenRecord.hubspotRefreshToken),
    expiresAt: tokenRecord.expiresAt,
    portalId: tokenRecord.hubspotPortalId,
  };
};
