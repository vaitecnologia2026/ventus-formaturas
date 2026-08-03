import { z } from 'zod';

const PROVIDER_TYPES = ['smtp', 'sendgrid', 'amazon_ses', 'generic_http'];
const STATUSES = ['pending', 'queued', 'sent', 'delivered', 'opened', 'clicked', 'bounced', 'complained', 'unsubscribed', 'failed', 'rejected'];

const AttachmentSchema = z.object({
  filename: z.string().min(1).max(255),
  contentType: z.string().min(3).max(120),
  contentBase64: z.string().optional(),
  url: z.string().url().optional(),
  content: z.string().optional(),
}).refine(a => a.contentBase64 || a.url || a.content, {
  message: 'Anexo precisa de contentBase64, url ou content',
});

export const ProviderCreateSchema = z.object({
  providerName:       z.string().min(2).max(80),
  providerType:       z.enum(PROVIDER_TYPES),
  active:             z.boolean().default(true),
  fromName:           z.string().min(1).max(120),
  fromEmail:          z.string().email(),
  replyTo:            z.string().email().optional(),
  // SMTP
  host:               z.string().optional(),
  port:               z.coerce.number().int().min(1).max(65535).optional(),
  secure:             z.boolean().optional(),
  username:           z.string().optional(),
  password:           z.string().optional(),
  // API key providers
  apiKey:             z.string().optional(),
  region:             z.string().optional(),
  accessKey:          z.string().optional(),
  secretKey:          z.string().optional(),
  // Generic HTTP
  baseUrl:            z.string().url().optional(),
  authType:           z.enum(['none', 'api_key_header', 'api_key_query', 'bearer_token', 'basic_auth', 'oauth2_client_credentials', 'custom_headers']).optional(),
  bearerToken:        z.string().optional(),
  customHeaders:      z.record(z.string(), z.string()).optional(),
  payloadTemplate:    z.unknown().optional(),
  responsePaths:      z.object({ messageId: z.string().optional(), status: z.string().optional(), error: z.string().optional() }).optional(),
  httpMethod:         z.enum(['POST', 'PUT', 'PATCH']).default('POST'),
  sendPath:           z.string().default('/send'),
  webhookSecret:      z.string().optional(),
  // Limits
  dailyLimit:         z.coerce.number().int().min(1).max(10_000_000).optional(),
  hourlyLimit:        z.coerce.number().int().min(1).max(1_000_000).optional(),
  rateLimitPerMinute: z.coerce.number().int().min(1).max(100000).default(60),
  timeoutMs:          z.coerce.number().int().min(1000).max(120000).default(15000),
});

export const ProviderUpdateSchema = ProviderCreateSchema.partial();

export const SendEmailSchema = z.object({
  providerId:  z.string().uuid(),
  to:          z.string().email().max(320),
  subject:     z.string().min(1).max(998),  // RFC 5322 limit
  html:        z.string().max(2_000_000).optional(),
  text:        z.string().max(2_000_000).optional(),
  templateId:  z.string().uuid().optional(),
  variables:   z.record(z.string(), z.unknown()).optional(),
  attachments: z.array(AttachmentSchema).max(20).optional(),
  metadata:    z.object({
    campaignId: z.string().optional(),
    leadId:     z.string().optional(),
  }).optional(),
}).refine(d => d.html || d.text || d.templateId, {
  message: 'Forneça html, text ou templateId',
});

export const SendTemplateSchema = z.object({
  providerId: z.string().uuid(),
  templateId: z.string().uuid(),
  to:         z.string().email().max(320),
  variables:  z.record(z.string(), z.unknown()).optional(),
  attachments: z.array(AttachmentSchema).max(20).optional(),
  metadata:   z.object({ campaignId: z.string().optional(), leadId: z.string().optional() }).optional(),
});

export const TemplateCreateSchema = z.object({
  providerId:       z.string().uuid().optional(),
  name:             z.string().min(2).max(120),
  category:         z.string().max(60).optional(),
  subject:          z.string().min(1).max(998),
  htmlBody:         z.string().min(1).max(2_000_000),
  textBody:         z.string().max(2_000_000).optional(),
  preview:          z.string().max(500).optional(),
  allowedVariables: z.array(z.string().min(1).max(80)).max(200).default([]),
  attachments:      z.array(AttachmentSchema).max(20).optional(),
  active:           z.boolean().default(true),
});

export const TemplateUpdateSchema = TemplateCreateSchema.partial();

export const ListMessagesSchema = z.object({
  providerId:  z.string().uuid().optional(),
  status:      z.enum(STATUSES).optional(),
  campaignId:  z.string().optional(),
  leadId:      z.string().optional(),
  toEmail:     z.string().email().optional(),
  page:        z.coerce.number().int().positive().default(1),
  pageSize:    z.coerce.number().int().min(1).max(200).default(50),
});

export const ListLogsSchema = z.object({
  messageId: z.string().uuid().optional(),
  page:      z.coerce.number().int().positive().default(1),
  pageSize:  z.coerce.number().int().min(1).max(200).default(50),
});
