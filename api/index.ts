import type { RequestHandler } from 'express';

let handler: RequestHandler | undefined;

export default async function vercelHandler(...args: Parameters<RequestHandler>) {
  if (!handler) {
    const module = await import('../server/src/app.js');
    handler = module.app;
  }

  return handler(...args);
}
