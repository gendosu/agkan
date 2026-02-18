export interface TaskTag {
  id: number;
  task_id: number;
  tag_id: number;
  created_at: string;
}

export interface CreateTaskTagInput {
  task_id: number;
  tag_id: number;
}
