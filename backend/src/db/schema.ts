import { pgTable, serial, varchar, text, timestamp, pgEnum, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { type InferSelectModel, type InferInsertModel } from 'drizzle-orm';

/**
 * Direction enum for field mapping sync
 */
export const syncDirectionEnum = pgEnum('sync_direction', ['wix_to_hs', 'hs_to_wix', 'bi']);

/**
 * Tokens Table
 * Stores per-instance OAuth credentials with encrypted HubSpot access/refresh tokens.
 */
export const tokens = pgTable(
  'tokens',
  {
    wixInstanceId: varchar('wix_instance_id', { length: 255 }).primaryKey(),
    hubspotPortalId: varchar('hubspot_portal_id', { length: 100 }),
    hubspotAccessToken: text('hubspot_access_token').notNull(),
    hubspotRefreshToken: text('hubspot_refresh_token').notNull(),
    tokenType: varchar('token_type', { length: 50 }).default('bearer').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('tokens_portal_id_idx').on(table.hubspotPortalId),
  ]
);

/**
 * Mappings Table
 * Stores dynamic field mapping definitions per Wix instance.
 */
export const mappings = pgTable(
  'mappings',
  {
    id: serial('id').primaryKey(),
    wixInstanceId: varchar('wix_instance_id', { length: 255 }).notNull(),
    wixField: varchar('wix_field', { length: 255 }).notNull(),
    hsField: varchar('hs_field', { length: 255 }).notNull(),
    direction: syncDirectionEnum('direction').notNull().default('bi'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('mappings_instance_idx').on(table.wixInstanceId),
    uniqueIndex('mappings_instance_pair_unique').on(
      table.wixInstanceId,
      table.wixField,
      table.hsField
    ),
  ]
);

/**
 * IdMap Table
 * Bi-directional mapping between Wix Contact IDs and HubSpot Contact IDs
 * to prevent duplicate creation and facilitate loop-free cross updates.
 */
export const idMap = pgTable(
  'id_map',
  {
    id: serial('id').primaryKey(),
    wixInstanceId: varchar('wix_instance_id', { length: 255 }).notNull(),
    wixContactId: varchar('wix_contact_id', { length: 255 }).notNull(),
    hsContactId: varchar('hs_contact_id', { length: 255 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('id_map_wix_contact_unique').on(table.wixInstanceId, table.wixContactId),
    uniqueIndex('id_map_hs_contact_unique').on(table.wixInstanceId, table.hsContactId),
    index('id_map_instance_idx').on(table.wixInstanceId),
  ]
);

// Type definitions
export type Token = InferSelectModel<typeof tokens>;
export type NewToken = InferInsertModel<typeof tokens>;

export type Mapping = InferSelectModel<typeof mappings>;
export type NewMapping = InferInsertModel<typeof mappings>;
export type SyncDirection = 'wix_to_hs' | 'hs_to_wix' | 'bi';

export type IdMapEntry = InferSelectModel<typeof idMap>;
export type NewIdMapEntry = InferInsertModel<typeof idMap>;
