import * as fs from 'fs';
import * as path from 'path';
import { Hono } from 'hono';

export function registerStaticRoutes(app: Hono): void {
  app.get('/static/main.js', (c) => {
    const candidates = [
      path.join(__dirname, 'client', 'main.js'),
      path.join(__dirname, '..', '..', 'dist', 'board', 'client', 'main.js'),
    ];
    for (const bundlePath of candidates) {
      try {
        const content = fs.readFileSync(bundlePath, 'utf8');
        return new Response(content, {
          headers: { 'Content-Type': 'application/javascript; charset=utf-8' },
        });
      } catch {
        // Try next candidate
      }
    }
    return c.notFound();
  });

  app.get('/static/main.css', () => {
    const candidates = [
      path.join(__dirname, 'client', 'main.css'),
      path.join(__dirname, '..', '..', 'dist', 'board', 'client', 'main.css'),
    ];
    for (const p of candidates) {
      try {
        const content = fs.readFileSync(p, 'utf8');
        return new Response(content, { headers: { 'Content-Type': 'text/css; charset=utf-8' } });
      } catch {
        /* try next */
      }
    }
    return new Response('', { headers: { 'Content-Type': 'text/css' } });
  });
}
