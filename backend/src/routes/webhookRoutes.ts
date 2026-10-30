import { Router } from 'express';
import {
  handleWixWebhook,
  handleHubspotWebhook,
} from '../controllers/webhookController';

const router = Router();

/**
 * @route   POST /webhooks/wix
 * @desc    Handles Wix contact and form submission webhooks
 */
router.post('/wix', handleWixWebhook);

/**
 * @route   POST /webhooks/hubspot
 * @desc    Handles HubSpot CRM contact creation and property change webhooks
 */
router.post('/hubspot', handleHubspotWebhook);

export default router;
