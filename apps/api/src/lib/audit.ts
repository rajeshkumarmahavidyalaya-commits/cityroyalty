import type { Request } from 'express';
import { db } from '../db';
import { auditLogs } from '../db/schema';
import { logger } from '../logger';

export async function audit(req: Request | null, action: string, entity: string, entityId: string, summary: string, meta?: unknown) {
  try {
    await db().insert(auditLogs).values({ actorId: req?.user?.id ?? null, actorEmail: req?.user?.email ?? null, action, entity, entityId, summary, meta: meta ?? null, ip: req?.ip ?? null });
  } catch (err) {
    logger.error({ err }, 'audit log write failed');
  }
}
