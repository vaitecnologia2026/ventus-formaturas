import { z } from 'zod';

const PROVIDER_KINDS = ['generic_http', 'zenvia', 'pontaltech', 'infobip', 'takeblip'];
const AUTH_TYPES = [
  'none', 'api_key_header', 'api_key_query', 'bearer_token',
  'basic_auth', 'oauth2_client_credentials', 'custom_headers',
];
const MESSAGE_TYPES = ['text', 'rich_card', 'carousel', 'image', 'video', 'file', 'suggested_replies', 'suggested_actions', 'template'];
const STATUSES = ['pending', 'queued', 'sent', 'delivered', 'read', 'failed', 'rejected', 'expired', 'unknown'];

export const ProviderCreateSchema = z.object({
  providerName:       z.string().min(2).max(80),
  providerKind:       z.enum(PROVIDER_KINDS),
  active:             z.boolean().default(true),
  baseUrl:            z.string().url(),
  authType:           z.enum(AUTH_TYPES),

  apiKey:             z.string().optional(),
  bearerToken:        z.string().optional(),
  username:           z.string().optional(),
  password:           z.string().optional(),
  clientId:           z.string().optional(),
  clientSecret:       z.string().optional(),
  oauthTokenUrl:      z.string().url().optional(),
  oauthScope:         z.string().optional(),

  accountId:          z.string().optional(),
  senderId:           z.string().optional(),
  agentId:            z.string().optional(),
  webhookSecret:      z.string().optional(),

  defaultCountryCode: z.string().regex(/^\d{1,3}$/).default('55'),
  rateLimitPerMinute: z.coerce.number().int().min(1).max(100000).default(60),
  timeoutMs:          z.coerce.number().int().min(1000).max(120000).default(15000),

  customHeaders:      z.record(z.string(), z.string()).optional(),
  payloadTemplate:    z.unknown().optional(),
  responsePaths:      z.object({
    messageId: z.string().optional(),
    status:    z.string().optional(),
    error:     z.string().optional(),
  }).optional(),
  httpMethod:         z.enum(['POST', 'PUT', 'PATCH']).default('POST'),
  sendPath:           z.string().default('/send'),
});

export const ProviderUpdateSchema = ProviderCreateSchema.partial();

export const SendMessageSchema = z.object({
  providerId:    z.string().uuid(),
  to:            z.string().min(5).max(40),
  messageType:   z.enum(MESSAGE_TYPES).default('text'),
  text:          z.string().max(8000).optional(),
  payload:       z.unknown().optional(),
  templateId:    z.string().uuid().optional(),
  vars:          z.record(z.string(), z.unknown()).optional(),
  metadata:      z.object({
    campaignId: z.string().optional(),
    leadId:     z.string().optional(),
  }).optional(),
}).refine(d => d.text || d.payload || d.templateId, {
  message: 'Forneça pelo menos um de: text, payload ou templateId',
});

export const SendTemplateSchema = z.object({
  providerId: z.string().uuid(),
  templateId: z.string().uuid(),
  to:         z.string().min(5).max(40),
  vars:       z.record(z.string(), z.unknown()).optional(),
  metadata:   z.object({ campaignId: z.string().optional(), leadId: z.string().optional() }).optional(),
});

export const ListMessagesSchema = z.object({
  providerId:  z.string().uuid().optional(),
  status:      z.enum(STATUSES).optional(),
  campaignId:  z.string().optional(),
  leadId:      z.string().optional(),
  page:        z.coerce.number().int().positive().default(1),
  pageSize:    z.coerce.number().int().min(1).max(200).default(50),
});

export const ListLogsSchema = z.object({
  messageId: z.string().uuid().optional(),
  page:      z.coerce.number().int().positive().default(1),
  pageSize:  z.coerce.number().int().min(1).max(200).default(50),
});
