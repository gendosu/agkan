import { loadConfig } from '../../db/config';

const DEFAULT_BOARD_PORT = 8080;

export async function notifyBoard(): Promise<void> {
  try {
    const config = loadConfig();
    const port = config.board?.port ?? DEFAULT_BOARD_PORT;
    await fetch(`http://localhost:${port}/api/board/notify`, { method: 'POST' });
  } catch {
    // Board not running or unreachable — ignore silently
  }
}
