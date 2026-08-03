import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import * as ctrl from './rcs.controller.js';

const router = Router();

// Webhook é PÚBLICO (vem do provider, não do nosso usuário).
// rawBody é capturado pelo express.json verify hook em app.js — usado pra HMAC.
router.post('/webhook/:providerId', ctrl.postWebhook);

// Tudo abaixo exige JWT
router.use(requireAuth);

router.get('/providers',           ctrl.listProviders);
router.post('/providers',          ctrl.postProvider);
router.get('/providers/:id',       ctrl.getProvider);
router.put('/providers/:id',       ctrl.putProvider);
router.delete('/providers/:id',    ctrl.deleteProvider);

router.post('/test-connection',    ctrl.postTestConnection);
router.post('/send',               ctrl.postSend);
router.post('/send-template',      ctrl.postSendTemplate);

router.get('/messages',            ctrl.getMessages);
router.get('/messages/:id',        ctrl.getMessage);
router.get('/logs',                ctrl.getLogs);
router.get('/status',              ctrl.getStatus);

export default router;
