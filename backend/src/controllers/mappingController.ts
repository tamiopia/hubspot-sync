import { Request, Response, NextFunction } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../config/db';
import { mappings, tokens } from '../db/schema';
import { saveMappingsSchema } from '../utils/validators';
import { BadRequestError } from '../utils/errors';

/**
 * Retrieves all saved field mapping configurations for a specific Wix instance.
 * GET /api/mappings/:wixInstanceId OR GET /api/mappings (via x-wix-instance-id header)
 */
export const getMappings = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const wixInstanceId =
      req.params.wixInstanceId ||
      (req.headers['x-wix-instance-id'] as string) ||
      (req.query.wixInstanceId as string);

    if (!wixInstanceId || typeof wixInstanceId !== 'string') {
      throw new BadRequestError('wixInstanceId is required as a route parameter or x-wix-instance-id header');
    }

    const savedMappings = await db
      .select({
        id: mappings.id,
        wixInstanceId: mappings.wixInstanceId,
        wixField: mappings.wixField,
        hsField: mappings.hsField,
        direction: mappings.direction,
        createdAt: mappings.createdAt,
        updatedAt: mappings.updatedAt,
      })
      .from(mappings)
      .where(eq(mappings.wixInstanceId, wixInstanceId.trim()));

    res.status(200).json({
      success: true,
      data: savedMappings,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Saves and overwrites the field routing preferences for a Wix instance using a transaction.
 * POST /api/mappings
 */
export const saveMappings = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Validate request body using Zod schema
    const rawInstanceId =
      req.body.wixInstanceId || (req.headers['x-wix-instance-id'] as string);

    const validated = saveMappingsSchema.parse({
      wixInstanceId: rawInstanceId,
      mappings: req.body.mappings,
    });

    const { wixInstanceId, mappings: mappingList } = validated;

    // Use a Drizzle transaction to execute an atomic clean overwrite
    await db.transaction(async (tx) => {
      // 1. Delete all existing mappings for this instance
      await tx.delete(mappings).where(eq(mappings.wixInstanceId, wixInstanceId));

      // 2. Bulk insert new mappings if non-empty
      if (mappingList.length > 0) {
        await tx.insert(mappings).values(
          mappingList.map((item) => ({
            wixInstanceId,
            wixField: item.wixField,
            hsField: item.hsField,
            direction: item.direction,
            updatedAt: new Date(),
          }))
        );
      }
    });

    res.status(200).json({
      success: true,
      message: 'Mappings updated successfully',
      count: mappingList.length,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Checks HubSpot connection status for a Wix instance.
 * GET /api/mappings/status/:wixInstanceId
 */
export const getConnectionStatus = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const wixInstanceId =
      req.params.wixInstanceId ||
      (req.headers['x-wix-instance-id'] as string) ||
      (req.query.wixInstanceId as string);

    if (!wixInstanceId || typeof wixInstanceId !== 'string') {
      res.status(200).json({ success: true, connected: false });
      return;
    }

    const [tokenRecord] = await db
      .select({ portalId: tokens.hubspotPortalId })
      .from(tokens)
      .where(eq(tokens.wixInstanceId, wixInstanceId.trim()))
      .limit(1);

    res.status(200).json({
      success: true,
      connected: !!tokenRecord,
      portalId: tokenRecord?.portalId || null,
    });
  } catch (err) {
    next(err);
  }
};
