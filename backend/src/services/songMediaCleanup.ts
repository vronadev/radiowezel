import path from "node:path";
import type { Song } from "../@types/models.js";
import type { IFileStore } from "../interfaces/IFileStore.js";
import { extractVideoId } from "./downloadService.js";

export function songMediaPrefixes(song: Song): string[] {
  const prefixes = new Set<string>();
  const videoId = extractVideoId(song.youtubeUrl);
  if (videoId) {
    prefixes.add(videoId);
  }
  if (song.localPath) {
    const base = path.basename(song.localPath);
    const dot = base.lastIndexOf(".");
    prefixes.add(dot > 0 ? base.slice(0, dot) : base);
  }
  return [...prefixes];
}

export function purgeSongMediaFiles(song: Song, songsDir: string, fileStore: IFileStore): void {
  if (song.localPath) {
    try {
      fileStore.unlink(song.localPath);
    } catch {
      // Ignore missing or locked files; remaining prefix cleanup still runs.
    }
  }
  const prefixes = songMediaPrefixes(song);
  if (prefixes.length === 0) {
    return;
  }
  let names: string[] = [];
  try {
    names = fileStore.listDir(songsDir);
  } catch {
    return;
  }
  for (const name of names) {
    if (prefixes.some((prefix) => name === prefix || name.startsWith(`${prefix}.`))) {
      try {
        fileStore.unlink(path.join(songsDir, name));
      } catch {
        // Ignore individual unlink failures.
      }
    }
  }
}
