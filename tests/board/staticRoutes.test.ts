import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import path from 'path';
import { Hono } from 'hono';
import { registerStaticRoutes } from '../../src/board/staticRoutes';

vi.mock('fs', () => ({ readFileSync: vi.fn() }));

describe('compiled board assets', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    ['main.js', 'application/javascript; charset=utf-8'],
    ['main.css', 'text/css; charset=utf-8'],
  ])('reads embedded %s relative to the standalone entrypoint', async (filename, contentType) => {
    const embeddedPath = path.join(path.dirname(process.argv[1]), 'client', filename);
    vi.mocked(fs.readFileSync).mockImplementation((candidate) => {
      if (candidate === embeddedPath) return 'embedded asset';
      throw new Error('No external assets');
    });
    const app = new Hono();
    registerStaticRoutes(app);
    const response = await app.request(`/static/${filename}`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe(contentType);
    expect(await response.text()).toBe('embedded asset');
  });
});
