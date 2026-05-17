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
): Promise<{ logs: string[]; errors: string[]; exitCode: number | undefined }> {
  const logs: string[] = [];
  const errors: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (...a: unknown[]) => logs.push(a.join(' '));
  console.error = (...a: unknown[]) => errors.push(a.join(' '));

  let exitCode: number | undefined;
  const originalExit = process.exit;
  process.exit = ((code?: number) => {
    exitCode = code;
  }) as never;

  try {
    await program.parseAsync(['node', 'test', ...args]);
  } finally {
    console.log = originalLog;
    console.error = originalError;
    process.exit = originalExit;
  }

  return { logs, errors, exitCode };
}
