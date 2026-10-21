import type { Request } from 'express';
import { AuditLog } from '../models';
import { logger } from '../logger';

export async function audit(req: Request | null, action: string, entity: string, entityId: string, summary: string, meta?: unknown) {
  try {
    await AuditLog.create({
      actorId: req?.user?.id,
      actorEmail: req?.user?.email,
      action,
      entity,
      entityId,
      summary,
      meta,
      ip: req?.ip,
    });
  } catch (err) {
    logger.error({ err }, 'audit log write failed');
  }
}
