import { Request, Response } from 'express';
import {
  syncWixToHubSpot,
  syncHubSpotToWix,
  processWixFormSubmission,
} from '../services/syncService';

/**
 * Handles incoming Wix Webhooks.
 * Returns 200 OK immediately and handles sync asynchronously to prevent webhook timeouts.
 *
 * Supported events:
 * - wix.contacts.v4.ContactCreated
 * - wix.contacts.v4.ContactUpdated
 * - wix.forms.v2.FormSubmitted
 */
export const handleWixWebhook = (req: Request, res: Response): void => {
  // Extract event metadata
  const eventType =
    req.body.eventType ||
    req.body.type ||
    (req.headers['x-wix-event-type'] as string);

  const instanceId =
    req.body.instanceId ||
    req.body.metadata?.instanceId ||
    (req.headers['x-wix-instance-id'] as string);

  const data = req.body.data || req.body.entity || req.body;

  console.log(`📩 [WixWebhook] Received webhook: eventType="${eventType}", instanceId="${instanceId}"`);
  console.log('📦 [WixWebhook] Payload:', JSON.stringify(req.body, null, 2));

  // Immediately respond 200 OK to prevent Wix webhook retry avalanches
  res.status(200).json({ received: true });

  // Asynchronously route event based on type
  setImmediate(async () => {
    try {
      if (!instanceId) {
        console.warn('[WixWebhook] Received webhook without resolvable instanceId:', req.body);
        return;
      }

      if (
        eventType === 'wix.contacts.v4.ContactCreated' ||
        eventType === 'wix.contacts.v4.ContactUpdated'
      ) {
        const wixContactId =
          data.contact?.id ||
          data.id ||
          data.entityId ||
          req.body.entityId;

        if (!wixContactId) {
          console.warn('[WixWebhook] Contact event received without contactId:', data);
          return;
        }

        await syncWixToHubSpot(String(instanceId), String(wixContactId), data);
      } else if (eventType === 'wix.forms.v2.FormSubmitted') {
        await processWixFormSubmission(String(instanceId), data);
      } else {
        console.log(`[WixWebhook] Ignored unhandled eventType: ${eventType}`);
      }
    } catch (err) {
      console.error('[WixWebhook] Asynchronous execution error:', err);
    }
  });
};

/**
 * Handles incoming HubSpot Webhook subscriptions.
 * Immediately returns 200 OK and asynchronously routes contact events.
 *
 * Supported events:
 * - contact.creation
 * - contact.propertyChange
 */
export const handleHubspotWebhook = (req: Request, res: Response): void => {
  const events = Array.isArray(req.body) ? req.body : [req.body];

  // Immediately respond 200 OK
  res.status(200).json({ received: true });

  // Asynchronously route events
  setImmediate(async () => {
    for (const event of events) {
      try {
        if (!event || !event.subscriptionType) continue;

        if (
          event.subscriptionType === 'contact.creation' ||
          event.subscriptionType === 'contact.propertyChange' ||
          event.subscriptionType === 'object.creation' ||
          event.subscriptionType === 'object.propertyChange'
        ) {
          const portalId = String(event.portalId);
          const hsContactId = String(event.objectId);

          const hsPayload = {
            properties: event.propertyName
              ? { [event.propertyName]: { value: event.propertyValue } }
              : {},
            rawEvent: event,
          };

          await syncHubSpotToWix(portalId, hsContactId, hsPayload);
        } else {
          console.log(`[HubSpotWebhook] Ignored non-contact subscriptionType: ${event.subscriptionType}`);
        }
      } catch (err) {
        console.error('[HubSpotWebhook] Asynchronous execution error for event:', err);
      }
    }
  });
};
