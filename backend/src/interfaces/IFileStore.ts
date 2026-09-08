export interface IFileStore {
  exists(filePath: string): boolean;
  readFile(filePath: string): string;
  writeFile(filePath: string, contents: string): void;
  mkdirp(dirPath: string): void;
  unlink(filePath: string): void;
  listDir(dirPath: string): string[];
}
