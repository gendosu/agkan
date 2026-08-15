import { Hono } from 'hono';
import {
  readBoardConfig,
  writeBoardConfig,
  DETAIL_PANE_MAX_WIDTH,
  VALID_THEMES,
  ThemePreference,
} from '../boardConfig';

export function registerConfigApiRoutes(app: Hono, configDir: string): void {
  app.get('/api/config', (c) => {
    const boardConfig = readBoardConfig(configDir);
    return c.json({ board: boardConfig });
  });

  app.put('/api/config', async (c) => {
    const body = await c.req.json<{ board?: { detailPaneWidth?: unknown; theme?: unknown } }>();
    const boardBody = body?.board ?? {};

    if (boardBody.detailPaneWidth !== undefined) {
      const width = boardBody.detailPaneWidth;
      if (typeof width !== 'number' || !Number.isFinite(width)) {
        return c.json({ error: 'detailPaneWidth must be a number' }, 400);
      }
      if (width > DETAIL_PANE_MAX_WIDTH) {
        return c.json({ error: `detailPaneWidth must not exceed ${DETAIL_PANE_MAX_WIDTH}` }, 400);
      }
      writeBoardConfig(configDir, { detailPaneWidth: width });
    }

    if (boardBody.theme !== undefined) {
      const theme = boardBody.theme;
      if (typeof theme !== 'string' || !(VALID_THEMES as string[]).includes(theme)) {
        return c.json({ error: `theme must be one of: ${VALID_THEMES.join(', ')}` }, 400);
      }
      writeBoardConfig(configDir, { theme: theme as ThemePreference });
    }

    return c.json({ success: true });
  });
}
