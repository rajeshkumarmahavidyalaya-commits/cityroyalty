import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ZodType } from 'zod';
import { badRequest } from './errors';

export const wrap =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown> | unknown): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

export function parse<T>(schema: ZodType<T>, data: unknown): T {
  const r = schema.safeParse(data);
  if (!r.success) {
    throw badRequest('Please check the highlighted fields', r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })), 'validation_error');
  }
  return r.data;
}

/** Express 5 exposes req.query as a getter, so validate into a fresh object. */
export const parseQuery = <T>(schema: ZodType<T>, req: Request) => parse(schema, req.query);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);
export const idParam = (req: Request, name = 'id'): string => {
  const v = req.params[name];
  if (!isUuid(v)) throw badRequest('Invalid id', undefined, 'invalid_id');
  return v;
};

/** ILIKE pattern that matches `s` literally anywhere in the column. */
export const contains = (s: string) => `%${s.replace(/[\\%_]/g, '\\$&')}%`;
