import { Router } from 'express';
import {
  initiateHubspotOAuth,
  handleHubspotCallback,
} from '../controllers/oauthController';

const router = Router();

/**
 * @route   GET /auth/hubspot
 * @desc    Initiate HubSpot OAuth flow
 * @query   wixInstanceId (required)
 */
router.get('/hubspot', initiateHubspotOAuth);

/**
 * @route   GET /auth/hubspot/callback
 * @desc    Handle HubSpot OAuth callback, token exchange, and encryption
 * @query   code, state
 */
router.get('/hubspot/callback', handleHubspotCallback);

export default router;
