import fs from "node:fs";
import type { IFileStore } from "../interfaces/IFileStore.js";

export class NodeFileStore implements IFileStore {
  exists(filePath: string): boolean {
    return fs.existsSync(filePath);
  }

  readFile(filePath: string): string {
    return fs.readFileSync(filePath, "utf8");
  }

  writeFile(filePath: string, contents: string): void {
    fs.writeFileSync(filePath, contents);
  }

  mkdirp(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  unlink(filePath: string): void {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  listDir(dirPath: string): string[] {
    if (!fs.existsSync(dirPath)) {
      return [];
    }
    return fs.readdirSync(dirPath);
  }
}
