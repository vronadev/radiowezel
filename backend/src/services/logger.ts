import fs from "node:fs";
import path from "node:path";

export function logEvent(scope: string, event: string, data: Record<string, unknown> = {}): string {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    scope,
    event,
    ...data,
  });
  console.log(line);
  return line;
}

export function appendLogFile(filePath: string, record: Record<string, unknown>): void {
  const line =
    JSON.stringify({
      ts: typeof record.ts === "string" ? record.ts : new Date().toISOString(),
      ...record,
    }) + "\n";
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, line, "utf8");
}

export function logEventToFile(
  filePath: string,
  scope: string,
  event: string,
  data: Record<string, unknown> = {},
): void {
  const line = logEvent(scope, event, data);
  const record = JSON.parse(line) as Record<string, unknown>;
  appendLogFile(filePath, record);
}
