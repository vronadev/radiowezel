import path from "node:path";
import type { AppConfig } from "../@types/models.js";
import type { IClock } from "../interfaces/IClock.js";
import type { IFileStore } from "../interfaces/IFileStore.js";
import { logEventToFile } from "../services/logger.js";
import type { IRealtimeHub } from "../realtime/events.js";
import { PlayerFFMPEG, type ProcessSpawner } from "../services/playerFfmpeg.js";
import type { QueueManager } from "../services/queueManager.js";
import type { SlotSchedule } from "../services/slotSchedule.js";
import type { SongService } from "../services/songService.js";

export interface PlayerFactoryInput {
  config: AppConfig;
  queueManager: QueueManager;
  songService: SongService;
  slotSchedule: SlotSchedule;
  clock?: IClock;
  fileStore?: IFileStore;
  spawnProcess?: ProcessSpawner;
  realtime?: IRealtimeHub;
}

export class PlayerFactory {
  static create(input: PlayerFactoryInput): PlayerFFMPEG {
    return new PlayerFFMPEG({
      queueManager: input.queueManager,
      songService: input.songService,
      slotSchedule: input.slotSchedule,
      fadeOutSecondsBeforeEnd: input.config.schedule.fadeOutSecondsBeforeEnd,
      ffplayPath: input.config.ffplayPath,
      ffmpegPath: input.config.ffmpegPath,
      pulseAudioServer: input.config.pulseAudioServer,
      clock: input.clock,
      fileStore: input.fileStore,
      spawnProcess: input.spawnProcess,
      onSongStarted: (entry) => {
        logEventToFile(path.join(input.config.dataDir, "played-songs.log"), "player", "song_started", entry);
        input.realtime?.publish({
          event: "song:playing",
          songId: entry.songId,
          title: entry.title,
          author: entry.author,
          startedAt: entry.startedAt,
          durationSeconds: entry.durationSeconds,
        });
      },
    });
  }
}
