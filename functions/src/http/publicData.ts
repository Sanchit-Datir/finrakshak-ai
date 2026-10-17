import { getAuth } from 'firebase-admin/auth';
import { logger } from 'firebase-functions';
import { onRequest, type Request } from 'firebase-functions/v2/https';
import type { Response } from 'express';
import { currentPointer, indexOf, openVersionFile } from '../services/publishedData.js';

const PREFIX = '/data/public-records/';

async function signedIn(req: Request): Promise<boolean> {
  const header = req.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
  if (token.length === 0) return false;
  try {
    await getAuth().verifyIdToken(token);
    return true;
  } catch {
    return false; // an invalid or expired token is the same as none
  }
}

function json(res: Response, status: number, body: unknown, cache: string): void {
  res
    .status(status)
    .set('Cache-Control', cache)
    .set('X-Content-Type-Options', 'nosniff')
    .json(body);
}

/** Exported separately so it can be exercised without the Functions runtime. */
export async function publicDataHandler(req: Request, res: Response): Promise<void> {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    json(res, 405, { error: 'Method not allowed' }, 'no-store');
    return;
  }
  // Public records, but bundles include registered addresses used for linking (B-38): signed-in only.
  if (!(await signedIn(req))) {
    json(res, 401, { error: 'Sign in required' }, 'no-store');
    return;
  }
  const path = req.path.startsWith(PREFIX) ? req.path.slice(PREFIX.length) : '';
  try {
    const pointer = await currentPointer();
    if (!pointer) {
      json(res, 404, { error: 'Nothing published yet' }, 'no-store');
      return;
    }
    if (path === 'index.json') {
      json(res, 200, indexOf(pointer), 'private, max-age=300');
      return;
    }
    if (path === 'current.json') {
      const { version, built_at, published_at, rows } = pointer;
      json(res, 200, { version, built_at, published_at, rows }, 'private, max-age=300');
      return;
    }
    const match = /^versions\/([^/]+)\/(.+)$/.exec(path);
    const file = match ? await openVersionFile(match[1] ?? '', match[2] ?? '') : null;
    if (!file) {
      json(res, 404, { error: 'Not found' }, 'no-store');
      return;
    }
    res
      .status(200)
      .set('Content-Type', file.contentType)
      .set('Content-Length', String(file.size))
      .set('Cache-Control', 'private, max-age=31536000, immutable')
      .set('X-Content-Type-Options', 'nosniff');
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    file.stream.on('error', (e: unknown) => {
      logger.error('publicData: stream failed', {
        reason: e instanceof Error ? e.message : 'unknown',
      });
      res.destroy();
    });
    file.stream.pipe(res);
  } catch (e) {
    logger.error('publicData: read failed', { reason: e instanceof Error ? e.message : 'unknown' });
    json(res, 503, { error: 'Data temporarily unavailable. Try again.' }, 'no-store');
  }
}

/**
 * Serves the published public-records bundle under the app's own origin (Hosting rewrite
 * `/data/**`), so the CSP stays `connect-src 'self'` (B-44). Reads only the publish bucket.
 */
export const publicData = onRequest(
  {
    region: 'asia-south1',
    // Cost guard: a handful of copies at most; bundles are cached by the browser (immutable).
    maxInstances: 3,
    memory: '256MiB',
    timeoutSeconds: 60,
    invoker: 'public',
  },
  publicDataHandler,
);
