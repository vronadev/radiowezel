import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import type { AppConfig } from "../@types/models.js";
import {
  DEFAULT_DOWNLOAD_MAX_ATTEMPTS,
  DEFAULT_DOWNLOAD_MAX_CONCURRENCY,
  DEFAULT_DOWNLOAD_RETRY_DELAY_MS,
} from "../constants/downloadQueue.js";
import {
  DEFAULT_QUEUE_RANDOM_FILL_SIZE,
  DEFAULT_QUEUE_RANDOM_MIN_REMAINING,
} from "../constants/queueFill.js";
import { parseFrontendOrigins } from "../http/frontendOrigins.js";
import { resolveVoteTieBreakMode } from "./voteTieBreak.js";

dotenv.config();

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

interface RawConfigFile {
  allowedEmailDomain?: string;
  adminEmails?: string[];
  adminEmail?: string;
  adminPassword?: string;
  jwtSecret?: string;
  schedule?: {
    slots?: Array<{ start: string; end: string }>;
    bellOffsetSeconds?: number;
    fadeOutSecondsBeforeEnd?: number;
  };
  voteTieBreakMode?: string;
  dataDir?: string;
  songsDir?: string;
  queueFilePath?: string;
  queue?: {
    randomMinRemaining?: number;
    randomFillSize?: number;
  };
  downloads?: {
    maxConcurrency?: number;
    maxAttempts?: number;
    retryDelayMs?: number;
  };
  playerKey?: string;
  ffmpegLocation?: string;
  smtp?: {
    host?: string;
    port?: number;
    secure?: boolean;
    user?: string;
    pass?: string;
    from?: string;
  };
}

function readConfigFile(): RawConfigFile {
  const configPath = path.join(backendRoot, "config.json");
  const examplePath = path.join(backendRoot, "config.example.json");
  try {
    return JSON.parse(fs.readFileSync(configPath, "utf8")) as RawConfigFile;
  } catch {
    if (fs.existsSync(examplePath)) {
      fs.copyFileSync(examplePath, configPath);
      return JSON.parse(fs.readFileSync(configPath, "utf8")) as RawConfigFile;
    }
    return {};
  }
}

function resolvePath(maybeRelative: string, fallback: string): string {
  const value = maybeRelative || fallback;
  return path.isAbsolute(value) ? value : path.resolve(backendRoot, value);
}

function parsePositiveInt(value: string | number | undefined, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function parseNonNegativeInt(value: string | number | undefined, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

export function loadConfig(): AppConfig {
  const file = readConfigFile();
  const dataDir = resolvePath(process.env.DATA_DIR || file.dataDir || "./data", "./data");
  const songsDir = resolvePath(process.env.SONGS_DIR || file.songsDir || "./data/songs", "./data/songs");
  const queueFilePath = resolvePath(
    process.env.QUEUE_FILE_PATH || file.queueFilePath || "./data/queue.json",
    "./data/queue.json",
  );
  const dbPath = process.env.DB_PATH || path.join(dataDir, "app.db");
  const jwtSecret = process.env.JWT_SECRET || file.jwtSecret;
  if (!jwtSecret) {
    throw new Error("JWT_SECRET is required in environment variables or config.json");
  }
  const frontend = parseFrontendOrigins(process.env.FRONTEND_ORIGIN || "http://localhost");

  return {
    allowedEmailDomain: process.env.ALLOWED_EMAIL_DOMAIN || file.allowedEmailDomain || "zsi.kielce.pl",
    adminEmails: file.adminEmails ?? [],
    adminEmail: file.adminEmail,
    adminPassword: file.adminPassword,
    jwtSecret,
    schedule: {
      slots: file.schedule?.slots ?? [],
      bellOffsetSeconds: file.schedule?.bellOffsetSeconds ?? 30,
      fadeOutSecondsBeforeEnd: file.schedule?.fadeOutSecondsBeforeEnd ?? 5,
    },
    voteTieBreakMode: resolveVoteTieBreakMode(process.env.VOTE_TIE_BREAK_MODE, file.voteTieBreakMode),
    dataDir,
    songsDir,
    queueFilePath,
    dbPath,
    port: Number(process.env.PORT || 3001),
    frontendOrigin: frontend.primary,
    frontendOrigins: frontend.allowed,
    frontendDir: process.env.FRONTEND_DIR || path.join(backendRoot, "public"),
    playerKey: process.env.PLAYER_KEY || file.playerKey,
    ffmpegLocation: process.env.FFMPEG_LOCATION || file.ffmpegLocation,
    smtp: {
      host: process.env.SMTP_HOST || file.smtp?.host,
      port: Number(process.env.SMTP_PORT || file.smtp?.port || 587),
      secure: process.env.SMTP_SECURE === "true" || file.smtp?.secure === true,
      user: process.env.SMTP_USER || file.smtp?.user,
      pass: process.env.SMTP_PASS || file.smtp?.pass,
      from: process.env.SMTP_FROM || file.smtp?.from,
    },
    pulseAudioServer: process.env.PULSE_SERVER?.trim() || undefined,
    ffplayPath: process.env.FFPLAY_PATH?.trim() || "ffplay",
    ffmpegPath: process.env.FFMPEG_PATH?.trim() || "ffmpeg",
    ffprobePath: process.env.FFPROBE_PATH?.trim() || "ffprobe",
    ...resolveQueueFill(file),
    ...resolveDownloadQueue(file),
  };
}

function resolveDownloadQueue(
  file: RawConfigFile,
): Pick<AppConfig, "downloadMaxConcurrency" | "downloadMaxAttempts" | "downloadRetryDelayMs"> {
  return {
    downloadMaxConcurrency: parsePositiveInt(
      process.env.DOWNLOAD_MAX_CONCURRENCY ?? file.downloads?.maxConcurrency,
      DEFAULT_DOWNLOAD_MAX_CONCURRENCY,
    ),
    downloadMaxAttempts: parsePositiveInt(
      process.env.DOWNLOAD_MAX_ATTEMPTS ?? file.downloads?.maxAttempts,
      DEFAULT_DOWNLOAD_MAX_ATTEMPTS,
    ),
    downloadRetryDelayMs: parseNonNegativeInt(
      process.env.DOWNLOAD_RETRY_DELAY_MS ?? file.downloads?.retryDelayMs,
      DEFAULT_DOWNLOAD_RETRY_DELAY_MS,
    ),
  };
}

function resolveQueueFill(file: RawConfigFile): Pick<AppConfig, "queueRandomMinRemaining" | "queueRandomFillSize"> {
  const queueRandomFillSize = parsePositiveInt(
    process.env.QUEUE_RANDOM_FILL_SIZE ?? file.queue?.randomFillSize,
    DEFAULT_QUEUE_RANDOM_FILL_SIZE,
  );
  const queueRandomMinRemaining = parsePositiveInt(
    process.env.QUEUE_RANDOM_MIN_REMAINING ?? file.queue?.randomMinRemaining,
    DEFAULT_QUEUE_RANDOM_MIN_REMAINING,
  );
  return {
    queueRandomFillSize,
    queueRandomMinRemaining: Math.min(queueRandomFillSize, queueRandomMinRemaining),
  };
}

export function getBackendRoot(): string {
  return backendRoot;
}
