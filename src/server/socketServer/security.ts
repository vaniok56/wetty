import helmet from 'helmet';
import type { Request, Response } from 'express';

/**
 * The page ships no inline <script> and no inline event handlers, so script-src
 * can stay at 'self' with neither 'unsafe-inline' nor 'unsafe-eval'. Page
 * config travels via data-* attributes on <body> instead.
 *
 * style-src still needs 'unsafe-inline': xterm.js and toastify inject <style>
 * elements at runtime.
 */
export const policies =
  (allowIframe: boolean) =>
  (req: Request, res: Response, next: (err?: unknown) => void): void => {
    const host = req.get('host');
    const args: Record<string, unknown> = {
      referrerPolicy: { policy: ['no-referrer-when-downgrade'] },
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          fontSrc: ["'self'", 'data:'],
          imgSrc: ["'self'", 'data:', 'blob:'],
          connectSrc: ["'self'", `ws://${host}`, `wss://${host}`],
          workerSrc: ["'self'"],
          manifestSrc: ["'self'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'none'"],
        },
      },
      frameguard: false as unknown,
    };
    if (!allowIframe) args.frameguard = { action: 'sameorigin' };

    helmet(args)(req, res, next);
  };
