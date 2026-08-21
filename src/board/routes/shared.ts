import { TaskService } from '../../services/TaskService';
import { TaskTagService } from '../../services/TaskTagService';
import { TagService } from '../../services/TagService';
import { MetadataService } from '../../services/MetadataService';
import { CommentService } from '../../services/CommentService';
import { TaskBlockService } from '../../services/TaskBlockService';
import { PtySessionService } from '../../terminal/PtySessionService';
import { AttentionStateService } from '../../services/AttentionStateService';
import { BoardEventService } from '../../services/BoardEventService';
import { StorageBackend } from '../../db/types/repository';
import { TaskStatus } from '../../models';
import { AgkanError, ConflictError, NotFoundError, ValidationError } from '../../errors';

export type BoardServices = {
  ts: TaskService;
  tts: TaskTagService;
  tags: TagService;
  ms: MetadataService;
  cs: CommentService;
  tbs: TaskBlockService;
  database: StorageBackend;
  boardTitle?: string;
  configDir: string;
  ptySessionService?: PtySessionService;
  boardEventService?: BoardEventService;
  attentionStateService?: AttentionStateService;
};

export const NON_ARCHIVE_STATUSES: TaskStatus[] = [
  'icebox',
  'backlog',
  'ready',
  'in_progress',
  'review',
  'done',
  'closed',
];

export function mapAgkanErrorToStatus(err: AgkanError): 400 | 404 | 409 | 500 {
  if (err instanceof NotFoundError) return 404;
  if (err instanceof ValidationError) return 400;
  if (err instanceof ConflictError) return 409;
  return 500;
}
