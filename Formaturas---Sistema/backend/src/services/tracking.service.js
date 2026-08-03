import crypto from 'crypto';
import { prisma } from '../db/prisma.js';

/**
 * Registra (ou atualiza) uma sessão de tracking.
 * `sessionToken` deve vir do front (cookie/localStorage) — se não vier,
 * geramos um novo.
 */
export async function captureSession({ sessionToken, captured }) {
  const token = sessionToken || crypto.randomUUID();
  const data = {
    sessionToken: token,
    gclid:        captured.gclid ?? null,
    gbraid:       captured.gbraid ?? null,
    wbraid:       captured.wbraid ?? null,
    utmSource:    captured.utmSource ?? null,
    utmMedium:    captured.utmMedium ?? null,
    utmCampaign:  captured.utmCampaign ?? null,
    utmContent:   captured.utmContent ?? null,
    utmTerm:      captured.utmTerm ?? null,
    campaignId:   captured.campaignId ?? null,
    adgroupId:    captured.adgroupId ?? null,
    creative:     captured.creative ?? null,
    keyword:      captured.keyword ?? null,
    matchtype:    captured.matchtype ?? null,
    device:       captured.device ?? null,
    placement:    captured.placement ?? null,
    landingPage:  captured.landingPage ?? null,
    referrer:     captured.referrer ?? null,
    userAgent:    captured.userAgent ?? null,
    ipAddress:    captured.ipAddress ?? null,
  };
  // Não sobrescreve clickIDs/UTMs existentes com null — atualização só preenche o que veio
  const updateData = Object.fromEntries(Object.entries(data).filter(([, v]) => v != null && v !== ''));
  return prisma.trackingSession.upsert({
    where: { sessionToken: token },
    create: data,
    update: updateData,
  });
}

/**
 * Vincula um lead identificado a uma sessão. Idempotente.
 */
export async function attachLead({ leadId, sessionToken, profile = {} }) {
  const session = await prisma.trackingSession.findUnique({ where: { sessionToken } });
  if (!session) {
    const e = new Error(`tracking_session_not_found: ${sessionToken}`);
    e.status = 404;
    throw e;
  }
  return prisma.leadAttribution.upsert({
    where: { leadId },
    create: {
      leadId,
      trackingSessionId: session.id,
      email: profile.email,
      phone: profile.phone,
      firstName: profile.firstName,
      lastName: profile.lastName,
      city: profile.city,
      state: profile.state,
      country: profile.country,
      postalCode: profile.postalCode,
    },
    update: {
      trackingSessionId: session.id,
      email: profile.email ?? undefined,
      phone: profile.phone ?? undefined,
      firstName: profile.firstName ?? undefined,
      lastName: profile.lastName ?? undefined,
      city: profile.city ?? undefined,
      state: profile.state ?? undefined,
      country: profile.country ?? undefined,
      postalCode: profile.postalCode ?? undefined,
    },
  });
}
