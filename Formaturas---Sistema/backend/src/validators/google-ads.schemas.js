import { z } from 'zod';

const UPLOAD_MODES = ['enhanced_conversions_for_leads', 'offline_click_conversion', 'data_manager_api'];
const EVENTS = ['lead_created', 'whatsapp_started', 'qualified_lead', 'proposal_sent', 'sale_completed', 'sale_lost'];

export const ConfigSchema = z.object({
  customerId:           z.string().regex(/^\d{10}$/, 'customer_id deve ter 10 dígitos'),
  loginCustomerId:      z.string().regex(/^\d{10}$/).optional(),
  developerToken:       z.string().min(10),
  clientId:             z.string().min(10),
  clientSecret:         z.string().min(10),
  refreshToken:         z.string().min(10),
  conversionActionId:   z.string().regex(/^\d+$/).optional(),
  conversionActionName: z.string().max(120).optional(),
  defaultCurrency:      z.string().length(3).default('BRL'),
  uploadMode:           z.enum(UPLOAD_MODES).default('offline_click_conversion'),
  eventActionMap:       z.record(z.enum(EVENTS), z.string().regex(/^\d+$/)).optional(),
});

export const UploadConversionSchema = z.object({
  leadId:             z.string().min(1).optional(),
  orderId:            z.string().min(1).optional(),
  conversionEvent:    z.enum(EVENTS),
  conversionValue:    z.coerce.number().nonnegative().optional(),
  conversionCurrency: z.string().length(3).optional(),
  conversionTime:     z.string().datetime().optional(),
  gclid:              z.string().optional(),
  gbraid:             z.string().optional(),
  wbraid:             z.string().optional(),
}).refine(d => d.leadId || d.orderId, { message: 'leadId ou orderId é obrigatório' });

export const ListQuerySchema = z.object({
  status:           z.enum(['pending', 'retrying', 'sent', 'failed', 'ignored', 'missing_required_data']).optional(),
  conversionEvent:  z.enum(EVENTS).optional(),
  page:             z.coerce.number().int().positive().default(1),
  pageSize:         z.coerce.number().int().min(1).max(200).default(50),
});

export const LogsQuerySchema = z.object({
  conversionId: z.string().uuid().optional(),
  page:         z.coerce.number().int().positive().default(1),
  pageSize:     z.coerce.number().int().min(1).max(200).default(50),
});
