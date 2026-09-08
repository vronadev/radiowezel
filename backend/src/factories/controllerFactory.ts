import { AuthController } from "../controllers/authController.js";
import { PlayerController } from "../controllers/playerController.js";
import { PlayController } from "../controllers/playController.js";
import { PlaylistController } from "../controllers/playlistController.js";
import { QueueController } from "../controllers/queueController.js";
import { PlaylistScheduleController, ScheduleController } from "../controllers/scheduleController.js";
import { SettingsController } from "../controllers/settingsController.js";
import { SongController } from "../controllers/songController.js";
import { VoteController } from "../controllers/voteController.js";
import { SongRequestController } from "../controllers/songRequestController.js";
import type { Application } from "./applicationFactory.js";

export interface Controllers {
  auth: AuthController;
  queue: QueueController;
  player: PlayerController;
  song: SongController;
  vote: VoteController;
  songRequest: SongRequestController;
  playlist: PlaylistController;
  schedule: ScheduleController;
  playlistSchedule: PlaylistScheduleController;
  settings: SettingsController;
  play: PlayController;
}

export class ControllerFactory {
  static create(application: Application): Controllers {
    const { dataLayer } = application;
    return {
      auth: new AuthController(
        dataLayer.userService,
        dataLayer.emailTokenService,
        application.email,
        application.config,
      ),
      queue: new QueueController(application.queueManager, application.player),
      player: new PlayerController(application.player, application.realtime),
      song: new SongController(
        dataLayer.songService,
        dataLayer.voteService,
        dataLayer.playlistService,
        application.queueManager,
        application.verification,
        application.config.songsDir,
        undefined,
        application.realtime,
        application.config.voteTieBreakMode,
      ),
      vote: new VoteController(
        dataLayer.voteService,
        dataLayer.songService,
        application.queueManager,
        application.youtubeMetadata,
        dataLayer.songRequestService,
        application.realtime,
      ),
      songRequest: new SongRequestController(
        dataLayer.songRequestService,
        dataLayer.songService,
        application.realtime,
      ),
      playlist: new PlaylistController(
        dataLayer.playlistService,
        dataLayer.songService,
        application.queueManager,
        application.playlistImport,
      ),
      schedule: new ScheduleController(application.config),
      playlistSchedule: new PlaylistScheduleController(
        dataLayer.settingsService,
        dataLayer.scheduleService,
        application.queueManager,
      ),
      settings: new SettingsController(dataLayer.settingsService),
      play: new PlayController(application.config.dataDir),
    };
  }
}
