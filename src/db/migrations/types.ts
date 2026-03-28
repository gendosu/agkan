// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyStatement = { get(...args: any[]): unknown; run(...args: any[]): unknown; all(...args: any[]): unknown[] };

export interface MigratableDatabase {
  exec(sql: string): unknown;
  prepare(sql: string): AnyStatement;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transaction(fn: (...args: any[]) => any): (...args: any[]) => any;
}

export type Migration = {
  version: string;
  description: string;
  up: (db: MigratableDatabase) => void;
};
