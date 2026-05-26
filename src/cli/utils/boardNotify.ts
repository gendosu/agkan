import { loadConfig } from '../../db/config';
import { DEFAULT_BOARD_PORT } from '../commands/config/get';

export async function notifyBoard(): Promise<void> {
  try {
    const config = loadConfig();
    const port = config.board?.port ?? DEFAULT_BOARD_PORT;
    await fetch(`http://localhost:${port}/api/board/notify`, { method: 'POST' });
  } catch {
    // Board not running or unreachable — ignore silently
  }
}
