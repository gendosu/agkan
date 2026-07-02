/**
 * Shared service-layer type definitions used by claude process runners.
 */

export type OutputEvent =
  | { kind: 'text'; text: string }
  | { kind: 'tool_use'; name: string; input: Record<string, unknown> }
  | { kind: 'done'; exitCode: number }
  | { kind: 'error'; message: string };

export interface RunLog {
  id: number;
  task_id: number;
  started_at: string;
  finished_at: string | null;
  exit_code: number | null;
  session_id: string | null;
  events: OutputEvent[];
}

export type CompletionConfirmCallback = (taskId: number, targetStatus: string) => void;
