import type { LlmPreference } from '../board/boardConfig';
import type { StorageBackend } from '../db/types/repository';
import type { IProcessService } from './IProcessService';
import { ClaudeProcessService } from './ClaudeProcessService';
import { CodexProcessService } from './CodexProcessService';

/**
 * ProcessServiceFactory
 * Creates the appropriate IProcessService implementation based on LlmPreference.
 * Defaults to ClaudeProcessService if llm is invalid or undefined.
 */
export class ProcessServiceFactory {
  /**
   * Create a process service for the given LLM preference.
   * @param llm The LLM preference ('claude' or 'codex')
   * @param db Optional database backend for persisting run logs
   * @returns An IProcessService implementation
   */
  static create(llm: LlmPreference | undefined, db?: StorageBackend | null): IProcessService {
    // Default to claude if not specified or invalid
    if (llm === 'codex') {
      return new CodexProcessService(db);
    }
    return new ClaudeProcessService(db);
  }
}
