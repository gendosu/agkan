// These types are defined in ClaudeProcessService and re-exported here for use by IProcessService
import type { OutputEvent, RunLog } from './ClaudeProcessService';

// SubscribeCallback is defined inline here since it uses OutputEvent which may be shared across implementations
export type SubscribeCallback = (event: OutputEvent) => void;

/**
 * IProcessService
 * Common interface for managing LLM processes (Claude, Codex, etc.)
 * Abstracts the details of process spawning, output parsing, and event streaming.
 */
export interface IProcessService {
  /**
   * Start a process for the given taskId with the provided prompt.
   * @param taskId Unique task identifier
   * @param prompt The input prompt for the LLM
   * @param command Type of command (run, planning, pr, etc.)
   * @throws ConflictError if a process is already running for this taskId
   */
  startProcess(taskId: number, prompt: string, command?: string): void;

  /**
   * Stop the process for the given taskId.
   * @param taskId Unique task identifier
   * @returns true if the process was found and stopped, false if no process was running
   */
  stopProcess(taskId: number): boolean;

  /**
   * List all currently running tasks with their command type.
   */
  listRunningTasks(): { taskId: number; command: string }[];

  /**
   * Subscribe to output events for a given taskId.
   * If process is running: replays past events and subscribes to future events.
   * If no process but storage available: replays last saved log from storage.
   * @param taskId Unique task identifier
   * @param callback Function called for each output event
   * @returns Unsubscribe function
   */
  subscribeOutput(taskId: number, callback: SubscribeCallback): () => void;

  /**
   * Get saved run logs for a task from storage (most recent first, up to 5).
   */
  getRunLogs(taskId: number): RunLog[];
}
