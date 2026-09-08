import fs from "node:fs";
import type { AppConfig } from "../@types/models.js";
import type { IDatabase } from "../interfaces/IDatabase.js";
import type { IClock } from "../interfaces/IClock.js";
import { AuthMiddleware } from "../middlewares/auth.js";
import { openDatabase } from "../repositories/sqliteDatabase.js";
import { DownloadService } from "../services/downloadService.js";
import { EmailSMTP } from "../services/emailSmtp.js";
import type { PlayerFFMPEG } from "../services/playerFfmpeg.js";
import { PlaylistImportService } from "../services/playlistImportService.js";
import type { QueueManager } from "../services/queueManager.js";
import { RealtimeHub } from "../services/realtimeHub.js";
import { SlotSchedule } from "../services/slotSchedule.js";
import { SongVerificationService } from "../services/songVerificationService.js";
import { SystemClock } from "../services/systemClock.js";
import { YoutubeMetadataService } from "../services/youtubeMetadataService.js";
import { getBackendRoot } from "../config/loadConfig.js";
import { DataLayerFactory, type DataLayer } from "./dataLayerFactory.js";
import { PlayerFactory } from "./playerFactory.js";
import { QueueManagerFactory } from "./queueManagerFactory.js";

export interface Application {
  config: AppConfig;
  database: IDatabase;
  dataLayer: DataLayer;
  clock: IClock;
  slotSchedule: SlotSchedule;
  queueManager: QueueManager;
  player: PlayerFFMPEG;
  downloader: DownloadService;
  youtubeMetadata: YoutubeMetadataService;
  email: EmailSMTP;
  auth: AuthMiddleware;
  verification: SongVerificationService;
  playlistImport: PlaylistImportService;
  realtime: RealtimeHub;
}

export class ApplicationFactory {
  static create(config: AppConfig, database?: IDatabase): Application {
    fs.mkdirSync(config.dataDir, { recursive: true });
    fs.mkdirSync(config.songsDir, { recursive: true });

    const db = database ?? openDatabase(config.dbPath);
    const dataLayer = DataLayerFactory.create(db);
    const clock = new SystemClock();
    const slotSchedule = new SlotSchedule(config.schedule.slots, clock, config.schedule.bellOffsetSeconds);
    const realtime = new RealtimeHub();
    const queueManager = QueueManagerFactory.create({
      config,
      songService: dataLayer.songService,
      voteService: dataLayer.voteService,
      playlistService: dataLayer.playlistService,
      slotSchedule,
      clock,
      onMutated: () => realtime.publish({ event: "queue:updated" }),
    });
    const player = PlayerFactory.create({
      config,
      queueManager,
      songService: dataLayer.songService,
      slotSchedule,
      clock,
      realtime,
    });

    const downloader = new DownloadService(getBackendRoot(), config.ffmpegLocation);
    const youtubeMetadata = new YoutubeMetadataService();
    const email = new EmailSMTP(config.smtp);
    const verification = new SongVerificationService(
      dataLayer.songService,
      dataLayer.playlistService,
      queueManager,
      downloader,
      config.songsDir,
      config.ffmpegLocation,
      {
        maxConcurrency: config.downloadMaxConcurrency,
        maxAttempts: config.downloadMaxAttempts,
        retryDelayMs: config.downloadRetryDelayMs,
        email,
        songRequestService: dataLayer.songRequestService,
        userService: dataLayer.userService,
        votePageUrl: `${config.frontendOrigin.replace(/\/$/, "")}/vote`,
        realtime,
      },
    );
    const playlistImport = new PlaylistImportService(
      dataLayer.playlistService,
      dataLayer.songService,
      queueManager,
      downloader,
      youtubeMetadata,
      verification,
      config.ffmpegLocation,
    );

    return {
      config,
      database: db,
      dataLayer,
      clock,
      slotSchedule,
      queueManager,
      player,
      downloader,
      youtubeMetadata,
      email,
      auth: new AuthMiddleware(dataLayer.userService, config.jwtSecret, config.playerKey),
      verification,
      playlistImport,
      realtime,
    };
  }
}
