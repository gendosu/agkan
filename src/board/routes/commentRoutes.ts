import { Hono } from 'hono';
import { CommentService } from '../../services/CommentService';
import { TaskService } from '../../services/TaskService';

function registerTaskCommentRoutes(app: Hono, cs: CommentService, ts: TaskService): void {
  app.get('/api/tasks/:id/comments', (c) => {
    const id = Number(c.req.param('id'));
    if (isNaN(id)) return c.json({ error: 'Invalid task id' }, 400);
    if (!ts.getTask(id)) return c.json({ error: 'Task not found' }, 404);
    return c.json({ comments: cs.listComments(id) });
  });
  app.post('/api/tasks/:id/comments', async (c) => {
    const id = Number(c.req.param('id'));
    if (isNaN(id)) return c.json({ error: 'Invalid task id' }, 400);
    if (!ts.getTask(id)) return c.json({ error: 'Task not found' }, 404);
    const body = await c.req.json<{ content?: string; author?: string }>();
    if (!body.content || typeof body.content !== 'string') {
      return c.json({ error: 'Content is required' }, 400);
    }
    try {
      const comment = cs.addComment({ task_id: id, content: body.content, author: body.author });
      return c.json(comment, 201);
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : 'Invalid input' }, 400);
    }
  });
}

function registerCommentIdRoutes(app: Hono, cs: CommentService): void {
  app.get('/api/comments/:id', (c) => {
    const id = Number(c.req.param('id'));
    if (isNaN(id)) return c.json({ error: 'Invalid comment id' }, 400);
    const comment = cs.getComment(id);
    if (!comment) return c.json({ error: 'Comment not found' }, 404);
    return c.json(comment);
  });
  app.patch('/api/comments/:id', async (c) => {
    const id = Number(c.req.param('id'));
    if (isNaN(id)) return c.json({ error: 'Invalid comment id' }, 400);
    const body = await c.req.json<{ content: string }>();
    if (!body.content || typeof body.content !== 'string') {
      return c.json({ error: 'Content is required' }, 400);
    }
    try {
      const comment = cs.updateComment(id, body.content);
      if (!comment) return c.json({ error: 'Comment not found' }, 404);
      return c.json(comment);
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : 'Invalid input' }, 400);
    }
  });
  app.delete('/api/comments/:id', (c) => {
    const id = Number(c.req.param('id'));
    if (isNaN(id)) return c.json({ error: 'Invalid comment id' }, 400);
    const deleted = cs.deleteComment(id);
    if (!deleted) return c.json({ error: 'Comment not found' }, 404);
    return c.json({ success: true });
  });
}

export function registerCommentRoutes(app: Hono, cs: CommentService, ts: TaskService): void {
  registerTaskCommentRoutes(app, cs, ts);
  registerCommentIdRoutes(app, cs);
}
