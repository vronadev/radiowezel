import type { AppConfig } from "../@types/models.js";
import type { PlaylistService } from "../services/playlistService.js";
import { QueueManager } from "../services/queueManager.js";
import type { SlotSchedule } from "../services/slotSchedule.js";
import type { SongService } from "../services/songService.js";
import type { VoteService } from "../services/voteService.js";
import type { IClock } from "../interfaces/IClock.js";
import type { IFileStore } from "../interfaces/IFileStore.js";

export interface QueueManagerFactoryInput {
  config: AppConfig;
  songService: SongService;
  voteService: VoteService;
  playlistService: PlaylistService;
  slotSchedule: SlotSchedule;
  clock?: IClock;
  fileStore?: IFileStore;
  random?: () => number;
  onMutated?: () => void;
}

export class QueueManagerFactory {
  static create(input: QueueManagerFactoryInput): QueueManager {
    return new QueueManager({
      songService: input.songService,
      voteService: input.voteService,
      playlistService: input.playlistService,
      slotSchedule: input.slotSchedule,
      queueFilePath: input.config.queueFilePath,
      clock: input.clock,
      fileStore: input.fileStore,
      random: input.random,
      randomMinRemaining: input.config.queueRandomMinRemaining,
      randomFillSize: input.config.queueRandomFillSize,
      voteTieBreakMode: input.config.voteTieBreakMode,
      onMutated: input.onMutated,
    });
  }
}
