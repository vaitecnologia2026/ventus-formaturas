import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import * as ctrl from '../controllers/google-ads.controller.js';

const router = Router();

router.use(requireAuth);

router.get('/status',                ctrl.getStatus);
router.post('/config',               ctrl.postConfig);
router.post('/test-connection',      ctrl.postTestConnection);
router.post('/upload-conversion',    ctrl.postUploadConversion);
router.post('/retry-failed',         ctrl.postRetryFailed);
router.get('/conversions',           ctrl.getConversions);
router.get('/logs',                  ctrl.getLogs);

export default router;
