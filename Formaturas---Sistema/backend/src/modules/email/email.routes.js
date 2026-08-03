import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import * as ctrl from './email.controller.js';

const router = Router();

// Webhook é PÚBLICO. rawBody capturado pelo express.json verify hook em app.js.
router.post('/webhook/:providerId', ctrl.postWebhook);

router.use(requireAuth);

router.get('/providers',         ctrl.listProviders);
router.post('/providers',        ctrl.postProvider);
router.get('/providers/:id',     ctrl.getProvider);
router.put('/providers/:id',     ctrl.putProvider);
router.delete('/providers/:id',  ctrl.deleteProvider);

router.post('/test-connection',  ctrl.postTestConnection);
router.post('/send',             ctrl.postSend);
router.post('/send-template',    ctrl.postSendTemplate);

router.get('/messages',          ctrl.getMessages);
router.get('/messages/:id',      ctrl.getMessage);
router.get('/logs',              ctrl.getLogs);
router.get('/status',            ctrl.getStatus);

router.get('/templates',         ctrl.listTemplates);
router.post('/templates',        ctrl.postTemplate);
router.put('/templates/:id',     ctrl.putTemplate);
router.delete('/templates/:id',  ctrl.deleteTemplate);

export default router;
