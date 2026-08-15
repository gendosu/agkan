import { Hono } from 'hono';
import { TaskTagService } from '../../services/TaskTagService';
import { TagService } from '../../services/TagService';
import { TaskService } from '../../services/TaskService';
import { BoardEventService } from '../../services/BoardEventService';

export function registerTagRoutes(
  app: Hono,
  tts: TaskTagService,
  tags: TagService,
  ts: TaskService,
  boardEventService?: BoardEventService
): void {
  app.post('/api/tasks/:id/tags', async (c) => {
    const id = Number(c.req.param('id'));
    if (isNaN(id)) return c.json({ error: 'Invalid task id' }, 400);
    const body = await c.req.json<{ tagId?: unknown }>();
    if (body.tagId === undefined || body.tagId === null) return c.json({ error: 'tagId is required' }, 400);
    const tagId = Number(body.tagId);
    if (!ts.getTask(id)) return c.json({ error: 'Task not found' }, 404);
    if (!tags.getTag(tagId)) return c.json({ error: 'Tag not found' }, 404);
    tts.addTagToTask({ task_id: id, tag_id: tagId });
    boardEventService?.notify();
    return c.json({ success: true }, 201);
  });
  app.delete('/api/tasks/:id/tags/:tagId', (c) => {
    const id = Number(c.req.param('id'));
    if (isNaN(id)) return c.json({ error: 'Invalid task id' }, 400);
    const tagId = Number(c.req.param('tagId'));
    if (isNaN(tagId)) return c.json({ error: 'Invalid tag id' }, 400);
    const removed = tts.removeTagFromTask(id, tagId);
    if (!removed) return c.json({ error: 'Tag not attached to task' }, 404);
    boardEventService?.notify();
    return c.json({ success: true });
  });
  app.get('/api/tags', (c) => {
    const allTags = tags.listTags();
    return c.json({ tags: allTags });
  });
  app.post('/api/tags', async (c) => {
    const body = await c.req.json<{ name?: unknown }>();
    if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
      return c.json({ error: 'Name is required' }, 400);
    }
    try {
      const tag = tags.createTag({ name: body.name.trim() });
      return c.json(tag, 201);
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : 'Failed to create tag' }, 400);
    }
  });
}
