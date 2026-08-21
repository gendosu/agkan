import { Hono } from 'hono';
import { ExportImportService, ExportData } from '../../services/ExportImportService';
import { BoardServices } from './shared';

export function registerExportImportRoutes(app: Hono, services: BoardServices): void {
  const { database } = services;

  app.get('/api/export', (c) => {
    try {
      const service = new ExportImportService(database);
      const data = service.exportData();
      const filename = `agkan-export-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
      c.header('Content-Disposition', `attachment; filename="${filename}"`);
      c.header('Content-Type', 'application/json');
      return c.body(JSON.stringify(data, null, 2));
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : 'Export failed' }, 500);
    }
  });

  app.post('/api/import', async (c) => {
    try {
      const data = await c.req.json<ExportData>();
      if (!data.tasks || !Array.isArray(data.tasks)) {
        return c.json({ error: 'Invalid export file format (missing tasks array)' }, 400);
      }
      const service = new ExportImportService(database);
      const result = service.importData(data);
      return c.json({ success: true, importedCount: result.importedCount });
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : 'Import failed' }, 500);
    }
  });
}
