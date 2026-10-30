import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';
import { exchangeHubspotToken, upsertHubspotTokens } from '../services/oauthService';
import { BadRequestError } from '../utils/errors';

const HUBSPOT_SCOPES = 'crm.objects.contacts.read crm.objects.contacts.write';

/**
 * Initiates HubSpot OAuth handshake.
 * GET /auth/hubspot?wixInstanceId=...
 */
export const initiateHubspotOAuth = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  try {
    const { wixInstanceId } = req.query;

    if (!wixInstanceId || typeof wixInstanceId !== 'string') {
      throw new BadRequestError('Query parameter "wixInstanceId" is required');
    }

    // Base64 encode instance ID into state parameter to preserve context across redirect
    const state = Buffer.from(
      JSON.stringify({ wixInstanceId: wixInstanceId.trim() })
    ).toString('base64url');

    const authUrl = new URL('https://app.hubspot.com/oauth/authorize');
    authUrl.searchParams.set('client_id', env.HUBSPOT_CLIENT_ID);
    authUrl.searchParams.set('redirect_uri', env.HUBSPOT_REDIRECT_URI);
    authUrl.searchParams.set('scope', HUBSPOT_SCOPES);
    authUrl.searchParams.set('state', state);

    res.redirect(authUrl.toString());
  } catch (err) {
    next(err);
  }
};

/**
 * Handles OAuth callback from HubSpot.
 * GET /auth/hubspot/callback?code=...&state=...
 */
export const handleHubspotCallback = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { code, state, error, error_description } = req.query;

    // Handle user or portal cancellation
    if (error) {
      const description = error_description ? String(error_description) : String(error);
      throw new BadRequestError(`HubSpot authorization failed: ${description}`);
    }

    if (!code || typeof code !== 'string') {
      throw new BadRequestError('Authorization code is missing from callback');
    }

    if (!state || typeof state !== 'string') {
      throw new BadRequestError('OAuth state parameter is missing from callback');
    }

    // Decode state to recover wixInstanceId
    let wixInstanceId: string;
    try {
      const decoded = Buffer.from(state, 'base64url').toString('utf-8');
      try {
        const parsed = JSON.parse(decoded);
        wixInstanceId = parsed.wixInstanceId || decoded;
      } catch {
        wixInstanceId = decoded;
      }
    } catch {
      // Fallback for standard base64 if base64url fails
      try {
        const decoded = Buffer.from(state, 'base64').toString('utf-8');
        const parsed = JSON.parse(decoded);
        wixInstanceId = parsed.wixInstanceId || decoded;
      } catch {
        throw new BadRequestError('Invalid or corrupted OAuth state parameter');
      }
    }

    if (!wixInstanceId) {
      throw new BadRequestError('Unable to resolve wixInstanceId from OAuth state');
    }

    // Exchange auth code for tokens
    const tokenData = await exchangeHubspotToken(code, env.HUBSPOT_REDIRECT_URI);

    // Encrypt and persist tokens into PostgreSQL via Drizzle ORM
    await upsertHubspotTokens(wixInstanceId, tokenData);

    // Send HTML success response instructing user to close window
    const htmlResponse = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>HubSpot Connected Successfully</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      background-color: #f7f9fa;
    }
    .card {
      background: #ffffff;
      padding: 40px;
      border-radius: 12px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
      text-align: center;
      max-width: 440px;
      width: 90%;
    }
    .icon {
      font-size: 48px;
      margin-bottom: 16px;
    }
    h1 {
      color: #00A389;
      font-size: 24px;
      margin-top: 0;
      margin-bottom: 12px;
    }
    p {
      color: #33475b;
      font-size: 15px;
      line-height: 1.6;
      margin-bottom: 24px;
    }
    button {
      background-color: #ff7a59;
      color: #ffffff;
      border: none;
      padding: 12px 24px;
      border-radius: 6px;
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
      transition: background-color 0.2s ease;
    }
    button:hover {
      background-color: #e56545;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">✅</div>
    <h1>HubSpot Connected!</h1>
    <p>Your HubSpot account has been successfully authorized and connected. You can now close this window and return to your Wix dashboard.</p>
    <button onclick="window.close()">Close Window</button>
  </div>
  <script>
    if (window.opener) {
      window.opener.postMessage({
        type: 'HUBSPOT_OAUTH_SUCCESS',
        wixInstanceId: ${JSON.stringify(wixInstanceId)}
      }, '*');
      setTimeout(function() {
        window.close();
      }, 2500);
    }
  </script>
</body>
</html>`;

    res.status(200).send(htmlResponse);
  } catch (err) {
    next(err);
  }
};
