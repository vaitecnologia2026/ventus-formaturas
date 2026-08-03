import { Router } from 'express';
import { z } from 'zod';
import { captureTrackingMiddleware } from '../middleware/capture.js';
import { captureSession, attachLead } from '../services/tracking.service.js';

const router = Router();

const CaptureBody = z.object({
  sessionToken: z.string().min(8).optional(),
}).passthrough();

const AttachBody = z.object({
  leadId: z.string().min(1),
  sessionToken: z.string().min(8),
  profile: z.object({
    email: z.string().email().optional(),
    phone: z.string().optional(),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    country: z.string().optional(),
    postalCode: z.string().optional(),
  }).optional(),
});

/** POST /api/tracking/capture — chamado no landing/SPA navigation; público. */
router.post('/capture', captureTrackingMiddleware, async (req, res, next) => {
  try {
    const { sessionToken } = CaptureBody.parse(req.body || {});
    const session = await captureSession({ sessionToken, captured: req.capturedTracking });
    res.json({ ok: true, sessionToken: session.sessionToken, sessionId: session.id });
  } catch (err) { next(err); }
});

/** POST /api/tracking/attach-lead — vincula leadId a sessão; público (já validado na app). */
router.post('/attach-lead', async (req, res, next) => {
  try {
    const data = AttachBody.parse(req.body);
    const att = await attachLead(data);
    res.json({ ok: true, attribution: att });
  } catch (err) { next(err); }
});

export default router;
