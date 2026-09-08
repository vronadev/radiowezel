import { EventEmitter } from "node:events";
import fs from "node:fs";
import path from "node:path";
import ytDlpWrapModule from "yt-dlp-wrap";
import type { DownloadOptions, DownloadResult, IDownloader, PlaylistEntry } from "../interfaces/IDownloader.js";

export interface YtDlpClient {
  exec(args: string[]): EventEmitter & {
    ytDlpProcess?: { stdout?: NodeJS.ReadableStream; stderr?: NodeJS.ReadableStream };
  };
  execPromise(args: string[]): Promise<string>;
}

export interface DownloadRuntime {
  createClient(binaryPath: string): YtDlpClient;
  resolveBinary(): Promise<string>;
}

interface YtDlpWrapStatic {
  new (binaryPath: string): YtDlpClient;
  getYtDlpPath(): string;
  downloadFromGithub?(localPath: string, version?: string, platform?: string): Promise<void>;
}

const importedWrap = ytDlpWrapModule as unknown as { default?: YtDlpWrapStatic } & YtDlpWrapStatic;
const YTDlpWrap = importedWrap.default ?? importedWrap;

export function extractVideoId(url: string): string | null {
  const match = url.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
}

function formatYtdlpFailure(code: number, stderr: string, stdout: string): string {
  const details = [stderr.trim(), stdout.trim()].filter(Boolean).join("\n");
  if (details) {
    return `Error code: ${code}\n\nStderr:\n${details}`;
  }
  return `yt-dlp exit code ${code}`;
}

const defaultRuntime: DownloadRuntime = {
  createClient(binaryPath: string): YtDlpClient {
    return new YTDlpWrap(binaryPath);
  },
  async resolveBinary(): Promise<string> {
    return YTDlpWrap.getYtDlpPath();
  },
};

export class DownloadService implements IDownloader {
  private ytdlpPath: string | null = null;
  private downloadPromise: Promise<string> | null = null;
  private readonly runtime: DownloadRuntime;

  constructor(
    private readonly backendRoot: string,
    private readonly defaultFfmpegLocation?: string,
    runtime?: DownloadRuntime,
  ) {
    this.runtime = runtime ?? defaultRuntime;
  }

  async downloadAsMp3(youtubeUrl: string, outDir: string, options: DownloadOptions = {}): Promise<DownloadResult> {
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }

    const ytdlp = await this.ensureYtdlp();
    const id = extractVideoId(youtubeUrl) || String(Date.now());
    const outTmpl = path.join(outDir, `${id}.%(ext)s`);
    const ytdlpInstance = this.runtime.createClient(ytdlp);
    const ffmpegLocation = options.ffmpegLocation ?? this.defaultFfmpegLocation;

    const execArgs = [
      youtubeUrl,
      "-f",
      "bestaudio/best",
      "-x",
      "--audio-format",
      "mp3",
      "--audio-quality",
      "0",
      "-o",
      outTmpl,
      "--no-playlist",
      "--embed-metadata",
      "--embed-thumbnail",
      "--parse-metadata",
      "title:%(title)s",
      "--parse-metadata",
      "artist:%(uploader)s",
      "--print-json",
      "--js-runtimes",
      "node:" + process.execPath,
    ];
    if (ffmpegLocation) {
      execArgs.push("--ffmpeg-location", ffmpegLocation);
    }

    let meta: { title?: string; uploader?: string; channel?: string; duration?: number; thumbnail?: string } = {};
    try {
      await new Promise<void>((resolve, reject) => {
        let rawOutput = "";
        let stderrOutput = "";
        let settled = false;
        const finish = (action: () => void): void => {
          if (settled) {
            return;
          }
          settled = true;
          action();
        };
        const ytDlpEventEmitter = ytdlpInstance.exec(execArgs);
        if (ytDlpEventEmitter.ytDlpProcess?.stdout) {
          ytDlpEventEmitter.ytDlpProcess.stdout.on("data", (data: Buffer | string) => {
            rawOutput += data.toString();
          });
        }
        if (ytDlpEventEmitter.ytDlpProcess?.stderr) {
          ytDlpEventEmitter.ytDlpProcess.stderr.on("data", (data: Buffer | string) => {
            stderrOutput += data.toString();
          });
        }
        ytDlpEventEmitter.on("close", (code: number) => {
          if (code === 0) {
            try {
              const lines = rawOutput.trim().split("\n");
              for (const line of lines) {
                if (line.startsWith("{") && line.endsWith("}")) {
                  meta = JSON.parse(line) as typeof meta;
                  break;
                }
              }
            } catch {
              // Fallback if parsing fails
            }
            finish(() => resolve());
          } else {
            finish(() => reject(new Error(formatYtdlpFailure(code, stderrOutput, rawOutput))));
          }
        });
        ytDlpEventEmitter.on("error", (err: Error) => finish(() => reject(err)));
      });
    } catch (err) {
      this.cleanupPartialFiles(outDir, id);
      const message = String(err instanceof Error ? err.message : err);
      if (message.includes("ffmpeg") || message.includes("ffprobe")) {
        throw new Error(
          "ffmpeg nie znaleziony. Zainstaluj ffmpeg (https://ffmpeg.org) i dodaj do PATH, lub ustaw config.ffmpegLocation / FFMPEG_LOCATION.",
        );
      }
      throw err;
    }

    const title = meta.title || "Unknown";
    const author = meta.uploader || meta.channel || "Unknown";
    const duration = meta.duration || 0;
    const thumb = meta.thumbnail || null;
    const mp3Path = path.join(outDir, `${id}.mp3`);
    if (!fs.existsSync(mp3Path)) {
      this.cleanupPartialFiles(outDir, id);
      throw new Error("Nie udało się utworzyć pliku MP3. Sprawdź, czy ffmpeg jest w PATH.");
    }

    console.log(`Downloaded MP3: ${mp3Path} (title: ${title}, author: ${author}, duration: ${duration}s)`);
    return {
      filePath: mp3Path,
      title,
      author,
      coverUrl: thumb,
      durationSeconds: Math.round(duration),
    };
  }

  async getPlaylistEntries(playlistUrl: string, options: DownloadOptions = {}): Promise<PlaylistEntry[]> {
    const ytdlp = await this.ensureYtdlp();
    const instance = this.runtime.createClient(ytdlp);
    const ffmpegLocation = options.ffmpegLocation ?? this.defaultFfmpegLocation;
    const args = [playlistUrl, "--flat-playlist", "-j", "--no-warnings", "--skip-download"];
    if (ffmpegLocation) {
      args.push("--ffmpeg-location", ffmpegLocation);
    }
    const stdout = await instance.execPromise(args);
    const entries: PlaylistEntry[] = [];
    for (const line of (stdout || "").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }
      try {
        const parsed = JSON.parse(trimmed) as {
          id?: string;
          _type?: string;
          url?: string;
          webpage_url?: string;
          title?: string;
        };
        if (parsed.id && parsed._type !== "playlist") {
          entries.push({
            id: parsed.id,
            url: parsed.url || parsed.webpage_url || `https://www.youtube.com/watch?v=${parsed.id}`,
            title: parsed.title || "-",
          });
        }
      } catch {
        // Ignore non-JSON lines from yt-dlp.
      }
    }
    return entries;
  }

  private async ensureYtdlp(): Promise<string> {
    if (this.ytdlpPath) {
      return this.ytdlpPath;
    }
    if (this.runtime !== defaultRuntime) {
      this.ytdlpPath = await this.runtime.resolveBinary();
      return this.ytdlpPath;
    }
    try {
      this.ytdlpPath = await this.runtime.resolveBinary();
      return this.ytdlpPath;
    } catch {
      const bin = process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp";
      const binDir = path.join(this.backendRoot, "bin");
      const local = path.join(binDir, bin);
      if (fs.existsSync(local)) {
        this.ytdlpPath = local;
        return this.ytdlpPath;
      }
      if (!this.downloadPromise) {
        this.downloadPromise = (async () => {
          if (!fs.existsSync(binDir)) {
            fs.mkdirSync(binDir, { recursive: true });
          }
          const platform = process.platform === "win32" ? "win32" : process.platform === "darwin" ? "darwin" : "linux";
          try {
            if (typeof YTDlpWrap.downloadFromGithub === "function") {
              await YTDlpWrap.downloadFromGithub(local, undefined, platform);
            } else {
              await this.downloadYtdlpFromGithub(local, platform);
            }
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.error("yt-dlp auto-download failed:", message);
            throw new Error(
              "yt-dlp nie znaleziony. Zainstaluj yt-dlp (np. z https://github.com/yt-dlp/yt-dlp) i umieść w PATH lub w backend/bin/",
            );
          }
          return local;
        })();
      }
      this.ytdlpPath = await this.downloadPromise;
      return this.ytdlpPath;
    }
  }

  private async downloadYtdlpFromGithub(localPath: string, platform: string): Promise<void> {
    const fileName = platform === "win32" ? "yt-dlp.exe" : "yt-dlp";
    const url = "https://github.com/yt-dlp/yt-dlp/releases/latest/download/" + fileName;
    const response = await fetch(url, { redirect: "follow", headers: { "User-Agent": "Node" } });
    if (!response.ok) {
      throw new Error("Download failed: " + response.status);
    }
    const buffer = await response.arrayBuffer();
    fs.writeFileSync(localPath, Buffer.from(buffer));
    if (platform !== "win32") {
      fs.chmodSync(localPath, 0o755);
    }
  }

  private cleanupPartialFiles(outDir: string, id: string): void {
    try {
      const files = fs.readdirSync(outDir);
      for (const fileName of files) {
        if (fileName.startsWith(id + ".")) {
          fs.unlinkSync(path.join(outDir, fileName));
        }
      }
    } catch {
      // Ignore cleanup errors.
    }
  }
}
