import { z } from 'zod';

/**
 * Individual field mapping item schema
 */
export const fieldMappingItemSchema = z.object({
  wixField: z
    .string()
    .trim()
    .min(1, 'wixField cannot be empty'),
  hsField: z
    .string()
    .trim()
    .min(1, 'hsField cannot be empty'),
  direction: z.enum(['wix_to_hs', 'hs_to_wix', 'bi']).default('bi'),
});

/**
 * Payload schema for saving mappings
 */
export const saveMappingsSchema = z.object({
  wixInstanceId: z
    .string()
    .trim()
    .min(1, 'wixInstanceId is required'),
  mappings: z.array(fieldMappingItemSchema),
});

export type FieldMappingItem = z.infer<typeof fieldMappingItemSchema>;
export type SaveMappingsInput = z.infer<typeof saveMappingsSchema>;
