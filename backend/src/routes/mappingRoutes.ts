import { Router } from 'express';
import { getMappings, saveMappings, getConnectionStatus } from '../controllers/mappingController';

const router = Router();

/**
 * @route   GET /api/mappings/status/:wixInstanceId
 * @desc    Check HubSpot OAuth connection status
 */
router.get('/status/:wixInstanceId', getConnectionStatus);
router.get('/status', getConnectionStatus);

/**
 * @route   GET /api/mappings/:wixInstanceId
 * @desc    Get all field mappings for a specific Wix instance
 */
router.get('/:wixInstanceId', getMappings);

/**
 * @route   GET /api/mappings
 * @desc    Get field mappings when wixInstanceId is supplied via x-wix-instance-id header
 */
router.get('/', getMappings);

/**
 * @route   POST /api/mappings
 * @desc    Save/overwrite field mappings for a Wix instance
 */
router.post('/', saveMappings);

export default router;
