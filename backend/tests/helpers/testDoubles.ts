import type { IClock } from "../../src/interfaces/IClock.js";
import type { IFileStore } from "../../src/interfaces/IFileStore.js";

export class FixedClock implements IClock {
  constructor(private readonly date: Date) {}

  now(): Date {
    return this.date;
  }
}

export function atLocalTime(hours: number, minutes: number, seconds = 0): Date {
  const date = new Date("2026-09-07T00:00:00");
  date.setHours(hours, minutes, seconds, 0);
  return date;
}

export class MemoryFileStore implements IFileStore {
  private readonly files = new Map<string, string>();

  exists(filePath: string): boolean {
    return this.files.has(filePath);
  }

  readFile(filePath: string): string {
    const contents = this.files.get(filePath);
    if (contents === undefined) {
      throw new Error("missing file");
    }
    return contents;
  }

  writeFile(filePath: string, contents: string): void {
    this.files.set(filePath, contents);
  }

  mkdirp(_dirPath: string): void {}

  unlink(filePath: string): void {
    this.files.delete(filePath);
  }

  listDir(dirPath: string): string[] {
    const prefix = dirPath.endsWith("/") || dirPath.endsWith("\\") ? dirPath : `${dirPath}/`;
    const names: string[] = [];
    for (const filePath of this.files.keys()) {
      if (filePath === dirPath) {
        continue;
      }
      if (filePath.startsWith(prefix)) {
        names.push(filePath.slice(prefix.length).split(/[/\\]/)[0] ?? "");
      } else if (filePath.startsWith(dirPath) && /[/\\]/.test(filePath.slice(dirPath.length, dirPath.length + 1))) {
        names.push(filePath.slice(dirPath.length + 1).split(/[/\\]/)[0] ?? "");
      }
    }
    return [...new Set(names.filter(Boolean))];
  }

  addSongFile(filePath: string): void {
    this.files.set(filePath, "audio");
  }
}

export class CountingFileStore extends MemoryFileStore {
  writes = 0;

  writeFile(filePath: string, contents: string): void {
    this.writes += 1;
    super.writeFile(filePath, contents);
  }
}
