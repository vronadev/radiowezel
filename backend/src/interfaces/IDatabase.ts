export interface StatementRunResult {
  changes: number;
  lastInsertRowid: number | bigint;
}

export interface IStatement<TResult = unknown> {
  get(...params: unknown[]): TResult | undefined;
  all(...params: unknown[]): TResult[];
  run(...params: unknown[]): StatementRunResult;
}

export interface IDatabase {
  exec(sql: string): void;
  prepare<TResult = unknown>(sql: string): IStatement<TResult>;
  transaction<T>(work: () => T): T;
  close(): void;
}
