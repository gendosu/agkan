export interface TaskBlock {
  id: number;
  blocker_task_id: number;
  blocked_task_id: number;
  created_at: string;
}

export interface CreateTaskBlockInput {
  blocker_task_id: number;
  blocked_task_id: number;
}
