import { Command } from 'commander';

export function createProgram(setup: (prog: Command) => void): Command {
  const prog = new Command();
  prog.exitOverride();
  setup(prog);
  return prog;
}

export async function runCommand(
  program: Command,
  args: string[]
): Promise<{ logs: string[]; exitCode: number | undefined }> {
  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (...a: unknown[]) => logs.push(a.join(' '));

  let exitCode: number | undefined;
  const originalExit = process.exit;
  process.exit = ((code?: number) => {
    exitCode = code;
  }) as never;

  try {
    await program.parseAsync(['node', 'test', ...args]);
  } finally {
    console.log = originalLog;
    process.exit = originalExit;
  }

  return { logs, exitCode };
}
