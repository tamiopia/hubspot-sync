import { eq, and, or } from 'drizzle-orm';
import { db } from '../config/db';
import { tokens, mappings, idMap } from '../db/schema';
import { getDecryptedTokens } from './oauthService';
import { acquireLock, isLocked } from '../utils/redisLock';

const HUBSPOT_API_BASE = 'https://api.hubapi.com';
const WIX_API_BASE = 'https://www.wixapis.com';

/**
 * Extracts nested property value from an object using a dot-delimited path (e.g. "info.name.first")
 */
const getNestedValue = (obj: any, path: string): any => {
  if (!obj || !path) return undefined;
  return path.split('.').reduce((acc, part) => (acc ? acc[part] : undefined), obj);
};

/**
 * Sets nested property value on an object using dot-delimited path
 */
const setNestedValue = (obj: any, path: string, value: any): void => {
  const parts = path.split('.');
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!current[part] || typeof current[part] !== 'object') {
      current[part] = {};
    }
    current = current[part];
  }
  current[parts[parts.length - 1]] = value;
};

/**
 * Extracts contact fields from a Wix Contact payload into standard properties
 */
const extractWixContactFields = (wixPayload: any): Record<string, string> => {
  const contact = wixPayload.contact || wixPayload;
  const info = contact.info || {};

  const fields: Record<string, string> = {};

  if (info.name?.first) fields['firstname'] = info.name.first;
  if (info.name?.last) fields['lastname'] = info.name.last;
  if (info.emails?.items?.[0]?.email) fields['email'] = info.emails.items[0].email;
  if (info.phones?.items?.[0]?.phone) fields['phone'] = info.phones.items[0].phone;
  if (info.company) fields['company'] = info.company;
  if (info.jobTitle) fields['jobtitle'] = info.jobTitle;

  // Flatten top-level keys if payload is pre-flattened
  if (contact.email && !fields['email']) fields['email'] = contact.email;
  if (contact.firstName && !fields['firstname']) fields['firstname'] = contact.firstName;
  if (contact.lastName && !fields['lastname']) fields['lastname'] = contact.lastName;
  if (contact.phone && !fields['phone']) fields['phone'] = contact.phone;

  return fields;
};

/**
 * Applies dynamic field mappings defined in the database for Wix -> HubSpot sync
 */
const mapWixToHsProperties = async (
  wixInstanceId: string,
  wixPayload: any
): Promise<Record<string, string>> => {
  const defaultFields = extractWixContactFields(wixPayload);

  // Retrieve custom field mappings where direction is 'wix_to_hs' or 'bi'
  const customMappings = await db
    .select()
    .from(mappings)
    .where(
      and(
        eq(mappings.wixInstanceId, wixInstanceId),
        or(eq(mappings.direction, 'wix_to_hs'), eq(mappings.direction, 'bi'))
      )
    );

  const mappedProperties: Record<string, string> = { ...defaultFields };

  for (const mapping of customMappings) {
    const val = getNestedValue(wixPayload.contact || wixPayload, mapping.wixField);
    if (val !== undefined && val !== null) {
      mappedProperties[mapping.hsField] = String(val);
    }
  }

  return mappedProperties;
};

/**
 * 1. Synchronizes a Wix Contact update/creation to HubSpot CRM.
 * Checks for Redis loop locks to prevent bounce-back echoes.
 */
export const syncWixToHubSpot = async (
  wixInstanceId: string,
  wixContactId: string,
  wixPayload: any
): Promise<{ success: boolean; action: string; hsContactId?: string }> => {
  // Check if this update was triggered by an incoming HubSpot webhook (loop prevention)
  const echoLockKey = `lock:hs_to_wix:${wixContactId}`;
  if (await isLocked(echoLockKey)) {
    console.log(`[SyncLoopPrevention] Dropping Wix->HubSpot sync for wixContactId: ${wixContactId} (active lock: ${echoLockKey})`);
    return { success: true, action: 'dropped_echo_prevention' };
  }

  // Retrieve decrypted HubSpot OAuth token
  const tokenRecord = await getDecryptedTokens(wixInstanceId);
  if (!tokenRecord) {
    console.warn(`[SyncService] No active HubSpot tokens found for wixInstanceId: ${wixInstanceId}`);
    return { success: false, action: 'missing_tokens' };
  }

  // Build mapped properties
  const properties = await mapWixToHsProperties(wixInstanceId, wixPayload);

  // Query idMap to see if HubSpot contact already exists
  const [existingMap] = await db
    .select()
    .from(idMap)
    .where(
      and(
        eq(idMap.wixInstanceId, wixInstanceId),
        eq(idMap.wixContactId, wixContactId)
      )
    )
    .limit(1);

  if (existingMap) {
    const hsContactId = existingMap.hsContactId;

    // Apply 10-second lock on HubSpot contact to ignore the outgoing echo from HubSpot
    await acquireLock(`lock:wix_to_hs:${hsContactId}`, 10);

    // PATCH existing HubSpot contact
    const response = await fetch(`${HUBSPOT_API_BASE}/crm/v3/objects/contacts/${hsContactId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${tokenRecord.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ properties }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error(`[SyncService] Failed to PATCH HubSpot contact ${hsContactId}:`, errBody);
      return { success: false, action: 'patch_failed', hsContactId };
    }

    console.log(`[SyncService] Successfully updated HubSpot contact ${hsContactId} from Wix contact ${wixContactId}`);
    return { success: true, action: 'updated', hsContactId };
  } else {
    // Contact does not exist in HubSpot yet -> Create in HubSpot
    const response = await fetch(`${HUBSPOT_API_BASE}/crm/v3/objects/contacts`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenRecord.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ properties }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error(`[SyncService] Failed to CREATE HubSpot contact for Wix contact ${wixContactId}:`, errBody);
      return { success: false, action: 'create_failed' };
    }

    const created = (await response.json()) as { id: string };
    const newHsContactId = String(created.id);

    // Set lock on new HubSpot contact ID to prevent immediate echo
    await acquireLock(`lock:wix_to_hs:${newHsContactId}`, 10);

    // Save mapping into idMap
    await db.insert(idMap).values({
      wixInstanceId,
      wixContactId,
      hsContactId: newHsContactId,
      updatedAt: new Date(),
    });

    console.log(`[SyncService] Successfully created HubSpot contact ${newHsContactId} and mapped to Wix ${wixContactId}`);
    return { success: true, action: 'created', hsContactId: newHsContactId };
  }
};

/**
 * 2. Synchronizes a HubSpot Contact event back to Wix Contacts.
 * Prevents sync loops using Redis idempotency locks.
 */
export const syncHubSpotToWix = async (
  portalId: string,
  hsContactId: string,
  hsPayload: any
): Promise<{ success: boolean; action: string; wixContactId?: string }> => {
  // Check if this update was triggered by our own outgoing call to HubSpot
  const echoLockKey = `lock:wix_to_hs:${hsContactId}`;
  if (await isLocked(echoLockKey)) {
    console.log(`[SyncLoopPrevention] Dropping HubSpot->Wix sync for hsContactId: ${hsContactId} (active lock: ${echoLockKey})`);
    return { success: true, action: 'dropped_echo_prevention' };
  }

  // Resolve wixInstanceId associated with this HubSpot portalId
  const [tokenRecord] = await db
    .select()
    .from(tokens)
    .where(eq(tokens.hubspotPortalId, portalId))
    .limit(1);

  if (!tokenRecord) {
    console.warn(`[SyncService] No Wix instance found associated with HubSpot portalId: ${portalId}`);
    return { success: false, action: 'portal_not_mapped' };
  }

  const wixInstanceId = tokenRecord.wixInstanceId;

  // Query idMap to find the matching wixContactId
  const [mapping] = await db
    .select()
    .from(idMap)
    .where(
      and(
        eq(idMap.wixInstanceId, wixInstanceId),
        eq(idMap.hsContactId, hsContactId)
      )
    )
    .limit(1);

  if (!mapping) {
    console.log(`[SyncService] No matching wixContactId found in idMap for hsContactId: ${hsContactId}`);
    return { success: false, action: 'no_id_mapping' };
  }

  const wixContactId = mapping.wixContactId;

  // Set 10-second lock on wixContactId to prevent bouncing back
  await acquireLock(`lock:hs_to_wix:${wixContactId}`, 10);

  // Fetch custom mappings for hs_to_wix / bi
  const customMappings = await db
    .select()
    .from(mappings)
    .where(
      and(
        eq(mappings.wixInstanceId, wixInstanceId),
        or(eq(mappings.direction, 'hs_to_wix'), eq(mappings.direction, 'bi'))
      )
    );

  // Build Wix contact patch payload
  const properties = hsPayload.properties || {};
  const wixPatchPayload: any = { info: {} };

  if (properties.firstname?.value || properties.firstname) {
    setNestedValue(wixPatchPayload, 'info.name.first', properties.firstname.value || properties.firstname);
  }
  if (properties.lastname?.value || properties.lastname) {
    setNestedValue(wixPatchPayload, 'info.name.last', properties.lastname.value || properties.lastname);
  }
  if (properties.phone?.value || properties.phone) {
    setNestedValue(wixPatchPayload, 'info.phones', [{ phone: properties.phone.value || properties.phone }]);
  }
  if (properties.company?.value || properties.company) {
    setNestedValue(wixPatchPayload, 'info.company', properties.company.value || properties.company);
  }

  // Apply custom mapping rules
  for (const cm of customMappings) {
    const val = properties[cm.hsField]?.value || properties[cm.hsField];
    if (val !== undefined) {
      setNestedValue(wixPatchPayload, cm.wixField, val);
    }
  }

  // Execute update to Wix Contacts REST API
  try {
    const response = await fetch(`${WIX_API_BASE}/contacts/v4/contacts/${wixContactId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'wix-instance-id': wixInstanceId.trim(),
        'wix-site-id': wixInstanceId.trim(),
      },
      body: JSON.stringify(wixPatchPayload),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[SyncService] Failed to PATCH Wix contact ${wixContactId}:`, errText);
      return { success: false, action: 'wix_patch_failed', wixContactId };
    }

    console.log(`[SyncService] Successfully updated Wix contact ${wixContactId} from HubSpot ${hsContactId}`);
    return { success: true, action: 'updated_wix', wixContactId };
  } catch (err) {
    console.error(`[SyncService] Error updating Wix contact ${wixContactId}:`, err);
    return { success: false, action: 'wix_network_error', wixContactId };
  }
};

/**
 * 3. Processes Wix Form Submissions with hidden UTM tracking parameter attribution.
 * Directly pushes leads into HubSpot CRM with marketing source attribution.
 */
export const processWixFormSubmission = async (
  wixInstanceId: string,
  formData: any
): Promise<{ success: boolean; hsContactId?: string }> => {
  const tokenRecord = await getDecryptedTokens(wixInstanceId);
  if (!tokenRecord) {
    console.warn(`[SyncService] No HubSpot tokens found for form submission on instance ${wixInstanceId}`);
    return { success: false };
  }

  // Extract form submission fields
  const fields = formData.submissionData?.fields || formData.fields || {};
  const submissionInfo = formData.submissionInfo || {};
  const context = submissionInfo.context || formData.context || {};

  // Standard lead fields
  const email = fields.email || fields.Email || fields['email-address'] || formData.email;
  const firstName = fields.firstName || fields.firstname || fields.first_name || fields.Name || formData.firstName;
  const lastName = fields.lastName || fields.lastname || fields.last_name || formData.lastName;
  const phone = fields.phone || fields.Phone || formData.phone;
  const message = fields.message || fields.Message || fields.comments;

  // Extract marketing attribution / UTM parameters from hidden context
  const utmSource = context.utm_source || context.utmSource || context.source || '';
  const utmMedium = context.utm_medium || context.utmMedium || '';
  const utmCampaign = context.utm_campaign || context.utmCampaign || '';
  const utmTerm = context.utm_term || context.utmTerm || '';
  const utmContent = context.utm_content || context.utmContent || '';

  const properties: Record<string, string> = {
    ...(email ? { email: String(email) } : {}),
    ...(firstName ? { firstname: String(firstName) } : {}),
    ...(lastName ? { lastname: String(lastName) } : {}),
    ...(phone ? { phone: String(phone) } : {}),
    ...(message ? { message: String(message) } : {}),
    ...(utmSource ? { hs_analytics_source_data_1: utmSource, utm_source: utmSource } : {}),
    ...(utmMedium ? { hs_analytics_source_data_2: utmMedium, utm_medium: utmMedium } : {}),
    ...(utmCampaign ? { utm_campaign: utmCampaign } : {}),
    ...(utmTerm ? { utm_term: utmTerm } : {}),
    ...(utmContent ? { utm_content: utmContent } : {}),
    lead_source: 'Wix Form Submission',
  };

  // Push lead to HubSpot CRM Contacts API
  try {
    const response = await fetch(`${HUBSPOT_API_BASE}/crm/v3/objects/contacts`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenRecord.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ properties }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error('[SyncService] Failed to push form lead to HubSpot:', errBody);
      return { success: false };
    }

    const created = (await response.json()) as { id: string };
    const hsContactId = String(created.id);

    // If Wix contact ID exists on form submission, record in idMap
    const wixContactId = submissionInfo.contactId || formData.contactId;
    if (wixContactId) {
      await db.insert(idMap).values({
        wixInstanceId,
        wixContactId: String(wixContactId),
        hsContactId,
        updatedAt: new Date(),
      });
    }

    console.log(`[SyncService] Captured lead into HubSpot contact ${hsContactId} with UTM attribution: ${utmSource}/${utmMedium}/${utmCampaign}`);
    return { success: true, hsContactId };
  } catch (err) {
    console.error('[SyncService] Network error pushing form submission to HubSpot:', err);
    return { success: false };
  }
};
