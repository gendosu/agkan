// Shared types for client-side board code

export interface Tag {
  id: number;
  name: string;
}

export interface TaskData {
  id: number;
  title: string;
  body?: string | null;
  status: string;
  priority?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface TaskDetail {
  task: TaskData;
  tags: Tag[];
  metadata: Array<{ key: string; value: string }>;
  blockedBy: Array<{ id: number }>;
  blocking: Array<{ id: number }>;
  parent: { id: number; title: string } | null;
}

export interface Comment {
  id: number;
  content: string;
  author?: string | null;
  created_at?: string;
}

export interface ActiveFilters {
  tagIds: number[];
  priorities: string[];
  assignee: string;
}

export interface ColumnData {
  status: string;
  html: string;
  count: number;
}
