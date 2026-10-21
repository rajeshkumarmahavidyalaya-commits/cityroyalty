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

export const idParam = (req: Request, name = 'id'): string => {
  const v = req.params[name];
  if (typeof v !== 'string' || !/^[a-f0-9]{24}$/i.test(v)) throw badRequest('Invalid id', undefined, 'invalid_id');
  return v;
};

export const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
