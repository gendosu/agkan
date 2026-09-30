let dataHandler: ((data: string) => void) | undefined;
let exitHandler: ((event: { exitCode: number }) => void) | undefined;

export function spawn() {
  return {
    pid: 1234,
    write() {},
    onData(handler: typeof dataHandler) {
      dataHandler = handler;
    },
    onExit(handler: typeof exitHandler) {
      exitHandler = handler;
    },
  };
}

export function emitData(data: string): void {
  if (!dataHandler) throw new Error('PTY data handler was not registered');
  dataHandler(data);
}

export function emitExit(): void {
  if (!exitHandler) throw new Error('PTY exit handler was not registered');
  exitHandler({ exitCode: 0 });
}
